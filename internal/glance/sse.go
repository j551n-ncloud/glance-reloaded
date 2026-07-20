package glance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// sseClient represents a single browser tab connected to the live update stream.
type sseClient struct {
	ch   chan string
	done <-chan struct{}
}

func (a *application) sseRegisterClient(c *sseClient) {
	a.sseMu.Lock()
	a.sseClients[c] = struct{}{}
	a.sseMu.Unlock()
}

func (a *application) sseUnregisterClient(c *sseClient) {
	a.sseMu.Lock()
	delete(a.sseClients, c)
	a.sseMu.Unlock()
}

// handleSSEUpdates streams widget-update events to the browser so that widget
// content refreshes in place instead of requiring a manual page reload.
func (a *application) handleSSEUpdates(w http.ResponseWriter, r *http.Request) {
	if a.handleUnauthorizedResponse(w, r, showUnauthorizedJSON) {
		return
	}

	if !a.DynamicUpdateEnabled {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	client := &sseClient{
		ch:   make(chan string, 16),
		done: r.Context().Done(),
	}
	a.sseRegisterClient(client)
	defer a.sseUnregisterClient(client)

	for {
		select {
		case msg := <-client.ch:
			fmt.Fprintf(w, "event: widget-update\ndata: %s\n\n", msg)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

// sseUpdateLoop periodically checks widgets for outdated content and pushes
// any changes to connected clients. It's a no-op when nobody is connected.
func (a *application) sseUpdateLoop(ctx context.Context) {
	if !a.DynamicUpdateEnabled {
		return
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.sseCheckAndPushUpdates(ctx)
		}
	}
}

func (a *application) sseBroadcastWidgetUpdate(msg string) {
	a.sseMu.RLock()
	defer a.sseMu.RUnlock()

	for c := range a.sseClients {
		select {
		case c.ch <- msg:
		default:
		}
	}
}

func (a *application) sseCheckAndPushUpdates(ctx context.Context) {
	a.sseMu.RLock()
	clientCount := len(a.sseClients)
	a.sseMu.RUnlock()
	if clientCount == 0 {
		return
	}

	now := time.Now()

	var wg sync.WaitGroup
	for widgetID, w := range a.widgetByID {
		if !w.requiresUpdate(&now) {
			continue
		}

		pg, exists := a.widgetToPage[widgetID]
		if !exists || !pg.DynamicUpdatesEnabled() {
			continue
		}

		wg.Add(1)
		go func(w widget, pg *page) {
			defer wg.Done()

			pg.mu.Lock()
			defer pg.mu.Unlock()

			recheckNow := time.Now()
			if !w.requiresUpdate(&recheckNow) {
				return
			}

			w.update(ctx)
			html := string(w.Render())

			type payload struct {
				WidgetID uint64 `json:"widgetId"`
				HTML     string `json:"html"`
			}
			msg, err := json.Marshal(payload{WidgetID: w.GetID(), HTML: html})
			if err != nil {
				return
			}

			a.sseBroadcastWidgetUpdate(string(msg))
		}(w, pg)
	}
	wg.Wait()
}
