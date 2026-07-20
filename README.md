<p align="center"><img src="docs/logo.png"></p>
<h1 align="center">Glance Reloaded</h1>
<p align="center">
  <a href="#installation">Install</a> •
  <a href="docs/configuration.md#configuring-glance">Configuration</a> •
  <a href="https://discord.com/invite/7KQ7Xa9kJd">Discord</a>
</p>
<p align="center">
  <a href="https://github.com/glanceapp/community-widgets">Community widgets</a> •
  <a href="docs/preconfigured-pages.md">Preconfigured pages</a> •
  <a href="docs/themes.md">Themes</a>
</p>

<p align="center">A lightweight, highly customizable dashboard that displays<br> your feeds in a beautiful, streamlined interface</p>

<p align="center"><em>A fork of <a href="https://github.com/glanceapp/glance">glanceapp/glance</a> — all credit for the original project goes to its authors and contributors. This fork adds live, server-pushed widget updates; everything else is unchanged.</em></p>

![](docs/images/readme-main-image.png)

## What's different in this fork

Upstream Glance only fetches widget data when a page is loaded (or manually
refreshed) — nothing updates in the background. This fork adds an optional
live-update channel: the server tracks which widgets have gone stale, re-fetches
them on their normal schedule, and pushes the freshly rendered HTML straight to
any open browser tab over `/api/sse/updates`. The changed widget is morphed into
place in the DOM (via [Idiomorph](https://github.com/bigskysoftware/idiomorph)),
so scroll position, open popovers, and focus are left alone.

It's on by default and needs no configuration. To turn it off:

```yaml
server:
  disable-dynamic-updates: true # disables it globally
```

```yaml
pages:
  - name: Home
    dynamic-updates: false # disables it for just this page
```

## Features
### Various widgets
* RSS feeds
* Subreddit posts
* Hacker News posts
* Weather forecasts
* YouTube channel uploads
* Twitch channels
* Market prices
* Docker containers status
* Server stats
* Custom widgets
* [and many more...](docs/configuration.md#configuring-glance)

### Fast and lightweight
* Low memory usage
* Few dependencies
* Minimal vanilla JS
* Single <20mb binary, buildable for any OS/architecture Go supports, and just as small a Docker container
* Uncached pages usually load within ~1s (depending on internet speed and number of widgets)

### Tons of customizability
* Different layouts
* As many pages/tabs as you need
* Numerous configuration options for each widget
* Multiple styles for some widgets
* Custom CSS

### Optimized for mobile devices
Because you'll want to take it with you on the go.

![](docs/images/mobile-preview.png)

### Themeable
Easily create your own theme by tweaking a few numbers or choose from one of the [already available themes](docs/themes.md).

![](docs/images/themes-example.png)

<br>

## Configuration
Configuration is done through YAML files, to learn more about how the layout works, how to add more pages and how to configure widgets, visit the [configuration documentation](docs/configuration.md#configuring-glance).
<details>
<summary><strong>Preview example configuration file</strong></summary>
<br>

```yaml
pages:
  - name: Home
    columns:
      - size: small
        widgets:
          - type: calendar
            first-day-of-week: monday

          - type: rss
            limit: 10
            collapse-after: 3
            cache: 12h
            feeds:
              - url: https://selfh.st/rss/
                title: selfh.st
                limit: 4
              - url: https://ciechanow.ski/atom.xml
              - url: https://www.joshwcomeau.com/rss.xml
                title: Josh Comeau
              - url: https://samwho.dev/rss.xml
              - url: https://ishadeed.com/feed.xml
                title: Ahmad Shadeed

          - type: twitch-channels
            channels:
              - theprimeagen
              - j_blow
              - piratesoftware
              - cohhcarnage
              - christitustech
              - EJ_SA

      - size: full
        widgets:
          - type: group
            widgets:
              - type: hacker-news
              - type: lobsters

          - type: videos
            channels:
              - UCXuqSBlHAE6Xw-yeJA0Tunw # Linus Tech Tips
              - UCR-DXc1voovS8nhAvccRZhg # Jeff Geerling
              - UCsBjURrPoezykLs9EqgamOA # Fireship
              - UCBJycsmduvYEL83R_U4JriQ # Marques Brownlee
              - UCHnyfMqiRRG1u-2MsSQLbXA # Veritasium

          - type: group
            widgets:
              - type: reddit
                subreddit: technology
                show-thumbnails: true
              - type: reddit
                subreddit: selfhosted
                show-thumbnails: true

      - size: small
        widgets:
          - type: weather
            location: London, United Kingdom
            units: metric
            hour-format: 12h

          - type: markets
            markets:
              - symbol: SPY
                name: S&P 500
              - symbol: BTC-USD
                name: Bitcoin
              - symbol: NVDA
                name: NVIDIA
              - symbol: AAPL
                name: Apple
              - symbol: MSFT
                name: Microsoft

          - type: releases
            cache: 1d
            repositories:
              - glanceapp/glance
              - go-gitea/gitea
              - immich-app/immich
              - syncthing/syncthing
```
</details>

<br>

## Installation

Choose one of the following methods:

<details>
<summary><strong>Docker compose (recommended)</strong></summary>
<br>

Create a `docker-compose.yml` file with the following contents:

```yaml
services:
  glance:
    container_name: glance
    image: ghcr.io/j551n-ncloud/glance-reloaded:latest
    restart: unless-stopped
    volumes:
      - ./config:/app/config
    ports:
      - 8080:8080
```

Then, create a new directory called `config` and download the example starting [`glance.yml`](https://github.com/glanceapp/glance/blob/main/docs/glance.yml) file into it by running:

```bash
mkdir config && wget -O config/glance.yml https://raw.githubusercontent.com/glanceapp/glance/refs/heads/main/docs/glance.yml
```

Feel free to edit the `glance.yml` file to your liking, and when ready run:

```bash
docker compose up -d
```

If you encounter any issues, you can check the logs by running:

```bash
docker logs glance
```

<hr>
</details>

<details>
<summary><strong>Build and run from source</strong></summary>
<br>

This fork doesn't publish precompiled binaries — only the Docker image above, built by [`.github/workflows/release.yaml`](.github/workflows/release.yaml). To run it directly, see [Building from source](#building-from-source) below.

<hr>
</details>

<br>

## Common issues
<details>
<summary><strong>Requests timing out</strong></summary>

The most common cause of this is when using Pi-Hole, AdGuard Home or other ad-blocking DNS services, which by default have a fairly low rate limit. Depending on the number of widgets you have in a single page, this limit can very easily be exceeded. To fix this, increase the rate limit in the settings of your DNS service.

If using Podman, in some rare cases the timeout can be caused by an unknown issue, in which case it may be resolved by adding the following to the bottom of your `docker-compose.yml` file:
```yaml
networks:
  podman:
    external: true
```
</details>

<details>
<summary><strong>Broken layout for markets, bookmarks or other widgets</strong></summary>

This is almost always caused by the browser extension Dark Reader. To fix this, disable dark mode for the domain where Glance is hosted.
</details>

<details>
<summary><strong>cannot unmarshal !!map into []glance.page</strong></summary>

The most common cause of this is having a `pages` key in your `glance.yml` and then also having a `pages` key inside one of your included pages. To fix this, remove the `pages` key from the top of your included pages.

</details>

<br>

## FAQ
<details>
<summary><strong>Does the information on the page update automatically?</strong></summary>
Yes. Widgets are re-fetched in the background on their normal cache schedule and pushed live to any open tab (see <a href="#whats-different-in-this-fork">What's different in this fork</a>), so a manual refresh is no longer needed. This can be disabled with <code>server.disable-dynamic-updates</code> or per-page with <code>dynamic-updates: false</code>.
</details>

<details>
<summary><strong>How frequently do widgets update?</strong></summary>
Each widget is re-fetched in the background according to its own cache lifetime, which is different for each widget and can be configured via the <code>cache</code> option.
</details>

<details>
<summary><strong>Can I create my own widgets?</strong></summary>

Yes, there are multiple ways to create custom widgets:
* `iframe` widget - allows you to embed things from other websites
* `html` widget - allows you to insert your own static HTML
* `extension` widget - fetch HTML from a URL
* `custom-api` widget - fetch JSON from a URL and render it using custom HTML
</details>

<details>
<summary><strong>Can I change the title of a widget?</strong></summary>

Yes, the title of all widgets can be changed by specifying the `title` property in the widget's configuration:

```yaml
- type: rss
  title: My custom title

- type: markets
  title: My custom title

- type: videos
  title: My custom title

# and so on for all widgets...
```
</details>

<br>

## Building from source

Choose one of the following methods:

<details>
<summary><strong>Build binary with Go</strong></summary>
<br>

Requirements: [Go](https://go.dev/dl/) >= v1.23

To build the project for your current OS and architecture, run:

```bash
go build -o build/glance .
```

To build for a specific OS and architecture, run:

```bash
GOOS=linux GOARCH=amd64 go build -o build/glance .
```

[*click here for a full list of GOOS and GOARCH combinations*](https://go.dev/doc/install/source#:~:text=$GOOS%20and%20$GOARCH)

Alternatively, if you just want to run the app without creating a binary, like when you're testing out changes, you can run:

```bash
go run .
```
<hr>
</details>

<details>
<summary><strong>Build project and Docker image with Docker</strong></summary>
<br>

Requirements: [Docker](https://docs.docker.com/engine/install/)

To build the project and image using just Docker, run:

*(replace `owner` with your name or organization)*

```bash
docker build -t owner/glance:latest .
```

If you wish to push the image to a registry (by default Docker Hub), run:

```bash
docker push owner/glance:latest
```

<hr>
</details>

<br>

## Contributing guidelines

* Avoid introducing new dependencies
* Avoid making backwards-incompatible configuration changes
* Avoid introducing new colors or hard-coding colors, use the standard `primary`, `positive` and `negative`
* For icons, try to use [heroicons](https://heroicons.com/) where applicable
* No `package.json`

<br>

## Credit

This is a fork of [glanceapp/glance](https://github.com/glanceapp/glance). All widgets, theming, configuration format, and the overall design are the work of that project's authors and contributors — go there for the general-purpose documentation, community widgets, and to [sponsor](https://github.com/sponsors/glanceapp) the original project. This fork's only addition is the live SSE-based widget updates described above.
