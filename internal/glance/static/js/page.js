import { setupPopovers } from './popover.js';
import { setupMasonries } from './masonry.js';
import { throttledDebounce, isElementVisible, openURLInNewTab } from './utils.js';
import { elem, find, findAll } from './templating.js';

async function fetchPageContent(pageData) {
    // TODO: handle non 200 status codes/time outs
    // TODO: add retries
    const response = await fetch(`${pageData.baseURL}/api/pages/${pageData.slug}/content/`);
    const content = await response.text();

    return content;
}

function setupCarousels() {
    const carouselElements = document.getElementsByClassName("carousel-container");

    if (carouselElements.length == 0) {
        return;
    }

    for (let i = 0; i < carouselElements.length; i++) {
        const carousel = carouselElements[i];

        if (carousel.dataset.initialized) continue;
        carousel.dataset.initialized = "true";

        carousel.classList.add("show-right-cutoff");
        const itemsContainer = carousel.getElementsByClassName("carousel-items-container")[0];

        const determineSideCutoffs = () => {
            if (itemsContainer.scrollLeft != 0) {
                carousel.classList.add("show-left-cutoff");
            } else {
                carousel.classList.remove("show-left-cutoff");
            }

            if (Math.ceil(itemsContainer.scrollLeft) + itemsContainer.clientWidth < itemsContainer.scrollWidth) {
                carousel.classList.add("show-right-cutoff");
            } else {
                carousel.classList.remove("show-right-cutoff");
            }
        }

        const determineSideCutoffsRateLimited = throttledDebounce(determineSideCutoffs, 20, 100);

        itemsContainer.addEventListener("scroll", determineSideCutoffsRateLimited);
        window.addEventListener("resize", determineSideCutoffsRateLimited);

        afterContentReady(determineSideCutoffs);
    }
}

const minuteInSeconds = 60;
const hourInSeconds = minuteInSeconds * 60;
const dayInSeconds = hourInSeconds * 24;
const monthInSeconds = dayInSeconds * 30.4;
const yearInSeconds = dayInSeconds * 365;

function timestampToRelativeTime(timestamp) {
    let delta = Math.round((Date.now() / 1000) - timestamp);
    let prefix = "";

    if (delta < 0) {
        delta = -delta;
        prefix = "in ";
    }

    if (delta < minuteInSeconds) {
        return prefix + "1m";
    }
    if (delta < hourInSeconds) {
        return prefix + Math.floor(delta / minuteInSeconds) + "m";
    }
    if (delta < dayInSeconds) {
        return prefix + Math.floor(delta / hourInSeconds) + "h";
    }
    if (delta < monthInSeconds) {
        return prefix + Math.floor(delta / dayInSeconds) + "d";
    }
    if (delta < yearInSeconds) {
        return prefix + Math.floor(delta / monthInSeconds) + "mo";
    }

    return prefix + Math.floor(delta / yearInSeconds) + "y";
}

function updateRelativeTimeForElements(elements)
{
    for (let i = 0; i < elements.length; i++)
    {
        const element = elements[i];
        const timestamp = element.dataset.dynamicRelativeTime;

        if (timestamp === undefined)
            continue

        element.textContent = timestampToRelativeTime(timestamp);
    }
}

function setupSearchBoxes() {
    const searchWidgets = document.getElementsByClassName("search");

    if (searchWidgets.length == 0) {
        return;
    }

    for (let i = 0; i < searchWidgets.length; i++) {
        const widget = searchWidgets[i];
        const defaultSearchUrl = widget.dataset.defaultSearchUrl;
        const target = widget.dataset.target || "_blank";
        const newTab = widget.dataset.newTab === "true";
        const inputElement = widget.getElementsByClassName("search-input")[0];
        const bangElement = widget.getElementsByClassName("search-bang")[0];
        const bangs = widget.querySelectorAll(".search-bangs > input");
        const bangsMap = {};
        const kbdElement = widget.getElementsByTagName("kbd")[0];
        let currentBang = null;
        let lastQuery = "";

        for (let j = 0; j < bangs.length; j++) {
            const bang = bangs[j];
            bangsMap[bang.dataset.shortcut] = bang;
        }

        const handleKeyDown = (event) => {
            if (event.key == "Escape") {
                inputElement.blur();
                return;
            }

            if (event.key == "Enter") {
                const input = inputElement.value.trim();
                let query;
                let searchUrlTemplate;

                if (currentBang != null) {
                    query = input.slice(currentBang.dataset.shortcut.length + 1);
                    searchUrlTemplate = currentBang.dataset.url;
                } else {
                    query = input;
                    searchUrlTemplate = defaultSearchUrl;
                }
                if (query.length == 0 && currentBang == null) {
                    return;
                }

                const url = searchUrlTemplate.replace("!QUERY!", encodeURIComponent(query));

                if (newTab && !event.ctrlKey || !newTab && event.ctrlKey) {
                    window.open(url, target).focus();
                } else {
                    window.location.href = url;
                }

                lastQuery = query;
                inputElement.value = "";

                return;
            }

            if (event.key == "ArrowUp" && lastQuery.length > 0) {
                inputElement.value = lastQuery;
                return;
            }
        };

        const changeCurrentBang = (bang) => {
            currentBang = bang;
            bangElement.textContent = bang != null ? bang.dataset.title : "";
        }

        const handleInput = (event) => {
            const value = event.target.value.trim();
            if (value in bangsMap) {
                changeCurrentBang(bangsMap[value]);
                return;
            }

            const words = value.split(" ");
            if (words.length >= 2 && words[0] in bangsMap) {
                changeCurrentBang(bangsMap[words[0]]);
                return;
            }

            changeCurrentBang(null);
        };

        inputElement.addEventListener("focus", () => {
            document.addEventListener("keydown", handleKeyDown);
            document.addEventListener("input", handleInput);
        });
        inputElement.addEventListener("blur", () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("input", handleInput);
        });

        document.addEventListener("keydown", (event) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            if (event.code != "KeyS") return;

            inputElement.focus();
            event.preventDefault();
        });

        kbdElement.addEventListener("mousedown", () => {
            requestAnimationFrame(() => inputElement.focus());
        });
    }
}

const dynamicRelativeTimeUpdateInterval = 60 * 1000;
let dynamicRelativeTimeInitialized = false;
let dynamicRelativeTimeLastUpdate = Date.now();

function setupDynamicRelativeTime() {
    // Always do an immediate pass over whatever's in the DOM right now —
    // widgets updated live via SSE bring in new elements that a stale,
    // closed-over NodeList from the first call would never see.
    updateRelativeTimeForElements(document.querySelectorAll("[data-dynamic-relative-time]"));

    if (dynamicRelativeTimeInitialized) return;
    dynamicRelativeTimeInitialized = true;

    const updateElementsAndTimestamp = () => {
        updateRelativeTimeForElements(document.querySelectorAll("[data-dynamic-relative-time]"));
        dynamicRelativeTimeLastUpdate = Date.now();
    };

    const scheduleRepeatingUpdate = () => setInterval(updateElementsAndTimestamp, dynamicRelativeTimeUpdateInterval);

    if (document.hidden === undefined) {
        scheduleRepeatingUpdate();
        return;
    }

    let timeout = scheduleRepeatingUpdate();

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            clearTimeout(timeout);
            return;
        }

        const delta = Date.now() - dynamicRelativeTimeLastUpdate;

        if (delta >= dynamicRelativeTimeUpdateInterval) {
            updateElementsAndTimestamp();
            timeout = scheduleRepeatingUpdate();
            return;
        }

        timeout = setTimeout(() => {
            updateElementsAndTimestamp();
            timeout = scheduleRepeatingUpdate();
        }, dynamicRelativeTimeUpdateInterval - delta);
    });
}

const _initializedGroupHeaders = new WeakSet();

function setupGroups() {
    const groups = document.getElementsByClassName("widget-type-group");

    if (groups.length == 0) {
        return;
    }

    for (let g = 0; g < groups.length; g++) {
        const group = groups[g];

        const headerEl = group.getElementsByClassName("widget-header")[0];
        if (!headerEl) continue;

        const titles = headerEl.children;
        const tabs = group.getElementsByClassName("widget-group-contents")[0].children;

        // A whole-group live SSE update replaces this element's entire
        // subtree (see the comment on selfAndDescendants above) and strips
        // any data-* attribute the morph doesn't know about, so the
        // currently selected tab is captured beforehand (_applyWidgetUpdate)
        // and handed back via this same attribute — read it here to pick up
        // where the user left off instead of resetting to the first tab.
        let current = parseInt(group.dataset.currentTab ?? "0", 10);
        if (Number.isNaN(current) || current < 0 || current >= titles.length) {
            current = 0;
        }

        const setCurrentTab = (nextCurrent) => {
            group.dataset.currentTab = String(nextCurrent);

            for (let i = 0; i < titles.length; i++) {
                titles[i].classList.remove("widget-group-title-current");
                titles[i].setAttribute("aria-selected", "false");
                tabs[i].classList.remove("widget-group-content-current");
                tabs[i].setAttribute("aria-hidden", "true");
            }

            const title = titles[nextCurrent];
            const tab = tabs[nextCurrent];
            if (!title || !tab) return;

            title.classList.add("widget-group-title-current");
            title.setAttribute("aria-selected", "true");
            tab.classList.add("widget-group-content-current");
            // Reset in case a prior live update forced this off below —
            // otherwise a genuine user click would stay silently un-animated.
            tab.style.animation = "";
            tab.setAttribute("aria-hidden", "false");
        };

        // Every call re-closes over this group's *current* titles/tabs
        // (freshly queried above), so stash it where the listeners attached
        // below — which may be surviving from an earlier call whose own
        // titles/tabs reference DOM a later live update replaced — can always
        // reach the version that's actually valid right now.
        group._glanceSetCurrentTab = setCurrentTab;

        if (!_initializedGroupHeaders.has(headerEl)) {
            _initializedGroupHeaders.add(headerEl);

            for (let t = 0; t < titles.length; t++) {
                const title = titles[t];

                if (title.dataset.titleUrl !== undefined) {
                    title.addEventListener("mousedown", (event) => {
                        if (event.button != 1) {
                            return;
                        }

                        openURLInNewTab(title.dataset.titleUrl, false);
                        event.preventDefault();
                    });
                }

                title.addEventListener("click", () => {
                    const activeCurrent = parseInt(group.dataset.currentTab ?? "0", 10);

                    if (t == activeCurrent) {
                        if (title.dataset.titleUrl !== undefined) {
                            openURLInNewTab(title.dataset.titleUrl);
                        }

                        return;
                    }

                    const liveTabs = group.getElementsByClassName("widget-group-contents")[0].children;
                    liveTabs[t].dataset.direction = activeCurrent < t ? "right" : "left";
                    group._glanceSetCurrentTab(t);
                });
            }
        }

        setCurrentTab(current);
    }
}

function setupLazyImages() {
    const images = document.querySelectorAll("img[loading=lazy]");

    if (images.length == 0) {
        return;
    }

    function imageFinishedTransition(image) {
        image.classList.add("finished-transition");
    }

    afterContentReady(() => {
        setTimeout(() => {
            for (let i = 0; i < images.length; i++) {
                const image = images[i];

                if (image.complete) {
                    image.classList.add("cached");
                    setTimeout(() => imageFinishedTransition(image), 1);
                } else {
                    // TODO: also handle error event
                    image.addEventListener("load", () => {
                        image.classList.add("loaded");
                        setTimeout(() => imageFinishedTransition(image), 400);
                    });
                }
            }
        }, 1);
    });
}

function attachExpandToggleButton(collapsibleContainer) {
    const showMoreText = "Show more";
    const showLessText = "Show less";

    let expanded = false;
    const button = document.createElement("button");
    const icon = document.createElement("span");
    icon.classList.add("expand-toggle-button-icon");
    const textNode = document.createTextNode(showMoreText);
    button.classList.add("expand-toggle-button");
    button.append(textNode, icon);

    // Exposed so a live SSE update can restore whether this was expanded
    // before the widget's HTML got replaced, without synthesizing a click
    // (which would also run the scroll-position adjustment below and jump
    // the page out from under someone who isn't even looking at it).
    const setExpandedState = (nextExpanded, options = {}) => {
        const skipScrollAdjustment = options.skipScrollAdjustment === true;
        expanded = nextExpanded;

        if (expanded) {
            collapsibleContainer.classList.add("container-expanded");
            button.classList.add("container-expanded");
            textNode.nodeValue = showLessText;
            return;
        }

        const topBefore = skipScrollAdjustment ? 0 : button.getClientRects()[0].top;

        collapsibleContainer.classList.remove("container-expanded");
        button.classList.remove("container-expanded");
        textNode.nodeValue = showMoreText;

        if (skipScrollAdjustment) {
            return;
        }

        const topAfter = button.getClientRects()[0].top;

        if (topAfter > 0)
            return;

        window.scrollBy({
            top: topAfter - topBefore,
            behavior: "instant"
        });
    };
    button.setExpandedState = setExpandedState;

    button.addEventListener("click", () => setExpandedState(!expanded));

    collapsibleContainer.after(button);

    return button;
};


function setupCollapsibleLists() {
    const collapsibleLists = document.querySelectorAll(".list.collapsible-container");

    if (collapsibleLists.length == 0) {
        return;
    }

    for (let i = 0; i < collapsibleLists.length; i++) {
        const list = collapsibleLists[i];

        if (list.dataset.collapseAfter === undefined) {
            continue;
        }

        const collapseAfter = parseInt(list.dataset.collapseAfter);

        if (collapseAfter == -1) {
            continue;
        }

        if (list.children.length <= collapseAfter) {
            continue;
        }

        attachExpandToggleButton(list);

        for (let c = collapseAfter; c < list.children.length; c++) {
            const child = list.children[c];
            child.classList.add("collapsible-item");
            child.style.animationDelay = ((c - collapseAfter) * 20).toString() + "ms";
        }
    }
}

function setupCollapsibleGrids() {
    const collapsibleGridElements = document.querySelectorAll(".cards-grid.collapsible-container");

    if (collapsibleGridElements.length == 0) {
        return;
    }

    for (let i = 0; i < collapsibleGridElements.length; i++) {
        const gridElement = collapsibleGridElements[i];

        if (gridElement.dataset.collapseAfterRows === undefined) {
            continue;
        }

        const collapseAfterRows = parseInt(gridElement.dataset.collapseAfterRows);

        if (collapseAfterRows == -1) {
            continue;
        }

        const getCardsPerRow = () => {
            return parseInt(getComputedStyle(gridElement).getPropertyValue('--cards-per-row'));
        };

        const button = attachExpandToggleButton(gridElement);

        let cardsPerRow;

        const resolveCollapsibleItems = () => requestAnimationFrame(() => {
            const hideItemsAfterIndex = cardsPerRow * collapseAfterRows;

            if (hideItemsAfterIndex >= gridElement.children.length) {
                button.style.display = "none";
            } else {
                button.style.removeProperty("display");
            }

            let row = 0;

            for (let i = 0; i < gridElement.children.length; i++) {
                const child = gridElement.children[i];

                if (i >= hideItemsAfterIndex) {
                    child.classList.add("collapsible-item");
                    child.style.animationDelay = (row * 40).toString() + "ms";

                    if (i % cardsPerRow + 1 == cardsPerRow) {
                        row++;
                    }
                } else {
                    child.classList.remove("collapsible-item");
                    child.style.removeProperty("animation-delay");
                }
            }
        });

        const observer = new ResizeObserver(() => {
            if (!isElementVisible(gridElement)) {
                return;
            }

            const newCardsPerRow = getCardsPerRow();

            if (cardsPerRow == newCardsPerRow) {
                return;
            }

            cardsPerRow = newCardsPerRow;
            resolveCollapsibleItems();
        });

        afterContentReady(() => observer.observe(gridElement));
    }
}

const contentReadyCallbacks = [];

function afterContentReady(callback) {
    contentReadyCallbacks.push(callback);
}

const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function makeSettableTimeElement(element, hourFormat) {
    const fragment = document.createDocumentFragment();
    const hour = document.createElement('span');
    const minute = document.createElement('span');
    const amPm = document.createElement('span');
    fragment.append(hour, document.createTextNode(':'), minute);

    if (hourFormat == '12h') {
        fragment.append(document.createTextNode(' '), amPm);
    }

    element.append(fragment);

    return (date) => {
        const hours = date.getHours();

        if (hourFormat == '12h') {
            amPm.textContent = hours < 12 ? 'AM' : 'PM';
            hour.textContent = hours % 12 || 12;
        } else {
            hour.textContent = hours < 10 ? '0' + hours : hours;
        }

        const minutes = date.getMinutes();
        minute.textContent = minutes < 10 ? '0' + minutes : minutes;
    };
};

function timeInZone(now, zone) {
    let timeInZone;

    try {
        timeInZone = new Date(now.toLocaleString('en-US', { timeZone: zone }));
    } catch (e) {
        // TODO: indicate to the user that this is an invalid timezone
        console.error(e);
        timeInZone = now
    }

    const diffInMinutes = Math.round((timeInZone.getTime() - now.getTime()) / 1000 / 60);

    return { time: timeInZone, diffInMinutes: diffInMinutes };
}

function zoneDiffText(diffInMinutes) {
    if (diffInMinutes == 0) {
        return "";
    }

    const sign = diffInMinutes < 0 ? "-" : "+";
    const signText = diffInMinutes < 0 ? "behind" : "ahead";

    diffInMinutes = Math.abs(diffInMinutes);

    const hours = Math.floor(diffInMinutes / 60);
    const minutes = diffInMinutes % 60;
    const hourSuffix = hours == 1 ? "" : "s";

    if (minutes == 0) {
        return { text: `${sign}${hours}h`, title: `${hours} hour${hourSuffix} ${signText}` };
    }

    if (hours == 0) {
        return { text: `${sign}${minutes}m`, title: `${minutes} minutes ${signText}` };
    }

    return { text: `${sign}${hours}h~`, title: `${hours} hour${hourSuffix} and ${minutes} minutes ${signText}` };
}

function setupClocks() {
    const clocks = document.getElementsByClassName('clock');

    if (clocks.length == 0) {
        return;
    }

    const updateCallbacks = [];

    for (var i = 0; i < clocks.length; i++) {
        const clock = clocks[i];
        const hourFormat = clock.dataset.hourFormat;
        const localTimeContainer = clock.querySelector('[data-local-time]');
        const localDateElement = localTimeContainer.querySelector('[data-date]');
        const localWeekdayElement = localTimeContainer.querySelector('[data-weekday]');
        const localYearElement = localTimeContainer.querySelector('[data-year]');
        const timeZoneContainers = clock.querySelectorAll('[data-time-in-zone]');

        const setLocalTime = makeSettableTimeElement(
            localTimeContainer.querySelector('[data-time]'),
            hourFormat
        );

        updateCallbacks.push((now) => {
            setLocalTime(now);
            localDateElement.textContent = now.getDate() + ' ' + monthNames[now.getMonth()];
            localWeekdayElement.textContent = weekDayNames[now.getDay()];
            localYearElement.textContent = now.getFullYear();
        });

        for (var z = 0; z < timeZoneContainers.length; z++) {
            const timeZoneContainer = timeZoneContainers[z];
            const diffElement = timeZoneContainer.querySelector('[data-time-diff]');

            const setZoneTime = makeSettableTimeElement(
                timeZoneContainer.querySelector('[data-time]'),
                hourFormat
            );

            updateCallbacks.push((now) => {
                const { time, diffInMinutes } = timeInZone(now, timeZoneContainer.dataset.timeInZone);
                setZoneTime(time);
                const { text, title } = zoneDiffText(diffInMinutes);
                diffElement.textContent = text;
                diffElement.title = title;
            });
        }
    }

    const updateClocks = () => {
        const now = new Date();

        for (var i = 0; i < updateCallbacks.length; i++)
            updateCallbacks[i](now);

        setTimeout(updateClocks, (60 - now.getSeconds()) * 1000);
    };

    updateClocks();
}

async function setupCalendars() {
    const elems = document.getElementsByClassName("calendar");
    if (elems.length == 0) return;

    // TODO: implement prefetching, currently loads as a nasty waterfall of requests
    const calendar = await import ('./calendar.js');

    for (let i = 0; i < elems.length; i++)
        calendar.default(elems[i]);
}

async function setupTodos() {
    const elems = Array.from(document.getElementsByClassName("todo"));
    if (elems.length == 0) return;

    const todo = await import ('./todo.js');

    for (let i = 0; i < elems.length; i++){
        todo.default(elems[i]);
    }
}

function setupTruncatedElementTitles() {
    const elements = document.querySelectorAll(".text-truncate, .single-line-titles .title, .text-truncate-2-lines, .text-truncate-3-lines");

    if (elements.length == 0) {
        return;
    }

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        if (element.getAttribute("title") === null)
            element.title = element.innerText.trim().replace(/\s+/g, " ");
    }
}

async function changeTheme(key, onChanged) {
    const themeStyleElem = find("#theme-style");

    const response = await fetch(`${pageData.baseURL}/api/set-theme/${key}`, {
        method: "POST",
    });

    if (response.status != 200) {
        alert("Failed to set theme: " + response.statusText);
        return;
    }
    const newThemeStyle = await response.text();

    const tempStyle = elem("style")
        .html("* { transition: none !important; }")
        .appendTo(document.head);

    themeStyleElem.html(newThemeStyle);
    document.documentElement.setAttribute("data-theme", key);
    document.documentElement.setAttribute("data-scheme", response.headers.get("X-Scheme"));
    typeof onChanged == "function" && onChanged();
    setTimeout(() => { tempStyle.remove(); }, 10);
}

function initThemePicker() {
    const themeChoicesInMobileNav = find(".mobile-navigation .theme-choices");
    if (!themeChoicesInMobileNav) return;

    const themeChoicesInHeader = find(".header-container .theme-choices");

    if (themeChoicesInHeader) {
        themeChoicesInHeader.replaceWith(
            themeChoicesInMobileNav.cloneNode(true)
        );
    }

    const presetElems = findAll(".theme-choices .theme-preset");
    let themePreviewElems = document.getElementsByClassName("current-theme-preview");
    let isLoading = false;

    presetElems.forEach((presetElement) => {
        const themeKey = presetElement.dataset.key;

        if (themeKey === undefined) {
            return;
        }

        if (themeKey == pageData.theme) {
            presetElement.classList.add("current");
        }

        presetElement.addEventListener("click", () => {
            if (themeKey == pageData.theme) return;
            if (isLoading) return;

            isLoading = true;
            changeTheme(themeKey, function() {
                isLoading = false;
                pageData.theme = themeKey;
                presetElems.forEach((e) => { e.classList.remove("current"); });

                Array.from(themePreviewElems).forEach((preview) => {
                    preview.querySelector(".theme-preset").replaceWith(
                        presetElement.cloneNode(true)
                    );
                })

                presetElems.forEach((e) => {
                    if (e.dataset.key != themeKey) return;
                    e.classList.add("current");
                });
            });
        });
    })
}

async function setupPage() {
    initThemePicker();

    const pageElement = document.getElementById("page");
    const pageContentElement = document.getElementById("page-content");
    const pageContent = await fetchPageContent(pageData);

    pageContentElement.innerHTML = pageContent;

    try {
        setupPopovers();
        setupClocks()
        await setupCalendars();
        await setupTodos();
        setupCarousels();
        setupSearchBoxes();
        setupCollapsibleLists();
        setupCollapsibleGrids();
        setupGroups();
        setupMasonries();
        setupDynamicRelativeTime();
        setupLazyImages();
    } finally {
        pageElement.classList.add("content-ready");
        pageElement.setAttribute("aria-busy", "false");

        for (let i = 0; i < contentReadyCallbacks.length; i++) {
            contentReadyCallbacks[i]();
        }

        setTimeout(() => {
            setupTruncatedElementTitles();
        }, 50);

        setTimeout(() => {
            document.body.classList.add("page-columns-transitioned");
        }, 300);
    }

    _initSSE();
}

// Idiomorph strips any data-* attributes and injected elements (toggle
// buttons, etc.) that only exist because JS added them client-side, since
// none of that is present in the server-rendered HTML it's morphing against.
// These capture/restore pairs read state out of the DOM before the morph and
// hand it back to the relevant setup function afterwards, so a live update
// doesn't visibly reset something the user had open.
//
// A widget-group's own root element carries the class an SSE update targets
// are matched against too — unlike a group's individually-addressable child
// widgets, the group as a whole is a single opaque unit here (see the
// widgetToPage registration in glance.go), so `element` itself, not just its
// descendants, needs to be checked.
function selfAndDescendants(element, selector) {
    const descendants = [...element.querySelectorAll(selector)];
    return element.matches(selector) ? [element, ...descendants] : descendants;
}

function getCollapsibleContainerStates(element) {
    const allContainers = selfAndDescendants(element, ".collapsible-container");
    return allContainers.map((container) => container.classList.contains("container-expanded"));
}

function restoreCollapsibleContainerStates(element, containerStates) {
    if (!containerStates.length) return;

    const allContainers = selfAndDescendants(element, ".collapsible-container");

    for (let index = 0; index < containerStates.length; index++) {
        const container = allContainers[index];
        if (!container) continue;

        const button = container.nextElementSibling;
        if (button && button.classList.contains("expand-toggle-button")) {
            const shouldBeExpanded = containerStates[index];
            const isExpanded = container.classList.contains("container-expanded");

            if (isExpanded === shouldBeExpanded) {
                continue;
            }

            button.setExpandedState(shouldBeExpanded, { skipScrollAdjustment: true });
        }
    }
}

function getGroupTabStates(element) {
    const groups = selfAndDescendants(element, ".widget-type-group");
    return groups.map((group) => {
        const currentTab = parseInt(group.dataset.currentTab ?? "0", 10);
        return Number.isNaN(currentTab) ? 0 : currentTab;
    });
}

function restoreGroupTabStates(element, groupTabStates) {
    if (!groupTabStates.length) return;

    const groups = selfAndDescendants(element, ".widget-type-group");

    for (let index = 0; index < groupTabStates.length; index++) {
        const group = groups[index];
        if (!group) continue;

        group.dataset.currentTab = String(groupTabStates[index]);
    }
}

// Applies a single widget's freshly rendered HTML to the live DOM using
// Idiomorph so unrelated nodes (scroll position, open popovers, focus) are
// left untouched instead of doing a crude innerHTML replacement.
function _applyWidgetUpdate(widgetId, html) {
    const target = document.querySelector(`.widget[data-widget-id="${widgetId}"]`);
    if (!target) return;

    const collapsibleContainerStates = getCollapsibleContainerStates(target);
    const groupTabStates = getGroupTabStates(target);

    // Idiomorph may resize the widget while it's above the viewport, which
    // would otherwise drag the page's scroll position along with it (the
    // browser's native scroll anchoring "helpfully" compensates for content
    // size changes above the fold) even though nothing the user is looking
    // at moved.
    const htmlElem = document.documentElement;
    const prevAnchor = htmlElem.style.overflowAnchor;
    htmlElem.style.overflowAnchor = "none";

    try {
        Idiomorph.morph(target, html, { morphStyle: "outerHTML" });
    } finally {
        htmlElem.style.overflowAnchor = prevAnchor;
    }

    const liveTarget = document.querySelector(`.widget[data-widget-id="${widgetId}"]`);
    if (!liveTarget) return;

    setupPopovers();
    setupCarousels();
    setupCollapsibleLists();
    setupCollapsibleGrids();
    restoreCollapsibleContainerStates(liveTarget, collapsibleContainerStates);
    // setupGroups() reads dataset.currentTab once, at setup time, to decide
    // which tab to display — it has to be restored before that call, not
    // after, or it'll already have defaulted to the first tab by then.
    restoreGroupTabStates(liveTarget, groupTabStates);
    setupGroups();
    // A background update shouldn't replay the tab slide-in animation as if
    // the user had just clicked it.
    const groupContents = liveTarget.querySelectorAll(".widget-group-content");
    for (let i = 0; i < groupContents.length; i++) {
        groupContents[i].style.animation = "none";
    }
    setupMasonries();
    setupDynamicRelativeTime();
    setupLazyImages();
    setupTruncatedElementTitles();
}

let _sseSource = null;
let _sseIntentionallyClosed = false;
let _sseRetryCount = 0;
// After enough consecutive hard failures, stop trying rather than retry
// forever — but never escalate to a page reload over it. Losing live
// updates and needing a manual refresh to pick back up is a strictly better
// outcome than the page yanking itself out from under whoever's looking at
// it, no matter what's actually wrong with the connection.
const _sseGiveUpAfterRetries = 20;

function _closeSSE() {
    if (_sseSource) {
        _sseIntentionallyClosed = true;
        _sseSource.close();
        _sseSource = null;
    }
}

function _initSSE() {
    if (!pageData.dynamicUpdateEnabled) {
        return;
    }

    _connectSSE();
}

function _connectSSE() {
    const url = `${pageData.baseURL}/api/sse/updates`;
    _sseSource = new EventSource(url, { withCredentials: true });

    _sseSource.addEventListener("widget-update", (event) => {
        try {
            const data = JSON.parse(event.data);
            _applyWidgetUpdate(data.widgetId, data.html);
        } catch (e) {
            console.error("SSE parse error", e);
        }
    });

    _sseSource.onopen = () => {
        _sseRetryCount = 0;
    };

    _sseSource.onerror = () => {
        if (_sseIntentionallyClosed) {
            return;
        }

        // A transient network error keeps the browser retrying on its own
        // (readyState stays CONNECTING) — we only land here once it's given
        // up entirely, which in practice means a reconnect got back a hard
        // failure (e.g. an expired session, or a proxy/CDN returning its own
        // error response instead of just dropping the connection).
        if (_sseSource.readyState !== EventSource.CLOSED) {
            return;
        }

        _sseSource.close();
        _sseRetryCount++;

        if (_sseRetryCount > _sseGiveUpAfterRetries) {
            console.error("Live widget updates disconnected and could not reconnect; reload the page to restore them.");
            return;
        }

        const delay = Math.min(1000 * 2 ** _sseRetryCount, 30000);
        setTimeout(() => {
            if (!_sseIntentionallyClosed) {
                _connectSSE();
            }
        }, delay);
    };
}

window.addEventListener("beforeunload", _closeSSE);

setupPage();
