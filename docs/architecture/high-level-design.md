# Graph Visualisation App - High-Level Architecture

This document outlines the high-level architecture for the Graph Visualisation App, a Next.js application configured for static export (`output: "export"`).

## 1. Requirements Summary

-   **Framework:** Next.js (Static Export)
-   **Core Functionality:** Visualise relationships between entities as a graph.
-   **Persistence:** Save/load graph data client-side using browser storage.
-   **Sharing:** Encode application state (graph data, view settings) into the URL for sharing.

## 2. Architectural Decisions

### 2.1. Graphing Library: React Flow

-   **Recommendation:** `reactflow` (React Flow)
-   **Rationale:**
    -   **React Native:** Built specifically for React, offering seamless integration with Next.js components and state management.
    -   **Feature Rich:** Provides essential features out-of-the-box, including node/edge rendering, custom nodes, zooming/panning, minimap, background patterns, and helper functions for graph manipulation.
    -   **Interactivity:** Supports dragging nodes, creating edges, selecting elements, and event handling.
    -   **Performance:** Generally performs well for moderate-sized graphs. Optimisations are possible for larger graphs if needed.
    -   **Static Export Compatibility:** As a client-side library, it works perfectly within a statically exported Next.js application. It does not rely on server-side rendering for its core functionality.
    -   **Alternatives Considered:**
        -   _Vis Network:_ Powerful but less React-centric integration.
        -   _D3.js:_ Highly flexible and powerful but requires significantly more boilerplate and manual implementation for graph interactions compared to React Flow.

### 2.2. State Management: Zustand

-   **Recommendation:** `zustand`
-   **Rationale:**
    -   **Simplicity:** Offers a minimal API, reducing boilerplate compared to Redux or even React Context for complex state.
    -   **Performance:** Optimised for performance, avoiding unnecessary re-renders. State updates are granular.
    -   **React Hooks:** Integrates naturally with React components via hooks.
    -   **Client-Side Focus:** Well-suited for managing client-side state in a static application. It manages graph data (nodes, edges) and UI state (selected nodes, view transformations).
    -   **Alternatives Considered:**
        -   _Jotai:_ Atomic state management, also a good choice, but Zustand's single-store approach might be slightly simpler for this application's structure initially.
        -   _Valtio:_ Proxy-based state management, another viable option.
        -   _React Context:_ Suitable for simpler state, but can lead to performance issues with frequent updates in complex applications like a graph visualiser without careful optimisation (memoization, selectors).

### 2.3. Persistence Strategy: localStorage (Initially)

-   **Recommendation:** Use `localStorage` with JSON serialisation initially. Re-evaluate if data size becomes a concern.
-   **Mechanism:**
    -   Graph state (nodes, edges, potentially view settings) will be serialised into a JSON string.
    -   This JSON string will be stored under a specific key in `localStorage`.
    -   On application load, the application will attempt to retrieve and deserialise the data from `localStorage`.
-   **Rationale:**
    -   **Simplicity:** `localStorage` has a very simple synchronous API, making implementation straightforward.
    -   **Sufficiency:** For many typical graph visualisation use cases, the 5-10MB limit of `localStorage` is sufficient.
    -   **Static Export Compatibility:** Works directly in the browser without server interaction.
-   **Contingency (IndexedDB):**
    -   If graph data size consistently exceeds `localStorage` limits or if more complex querying of stored data is needed in the future, migrate to `IndexedDB`.
    -   `IndexedDB` offers significantly more storage space and asynchronous operations, better suited for large datasets. Libraries like `idb` can simplify its usage.
-   **Data Format:** JSON is human-readable and easily parsed in JavaScript.

### 2.4. URL Encoding/Sharing Strategy: Hash Fragment + Compression

-   **Recommendation:** Encode application state into the URL's hash fragment (`#`), using Base64 encoding and compression.
-   **Mechanism:**
    1.  **Serialise State:** Convert the relevant application state (graph nodes, edges, view settings like zoom/pan coordinates) into a JSON string.
    2.  **Compress:** Compress the JSON string using a library like `pako` (implementing DEFLATE/Inflate algorithm, similar to gzip). This significantly reduces the string length for larger states.
    3.  **Encode:** Encode the compressed binary data into a Base64 string.
    4.  **Update URL:** Set the `window.location.hash` to the Base64 string (e.g., `#/H4sIAAAAAAAAE...`).
    5.  **Decode on Load:** On application load, check `window.location.hash`. If present:
        -   Decode the Base64 string back to binary data.
        -   Decompress the binary data using `pako`.
        -   Parse the resulting JSON string.
        -   Hydrate the application state (Zustand store) with the decoded data.
-   **Rationale:**
    -   **Client-Side Routing:** Using the hash fragment prevents full page reloads when the state changes, essential for a smooth user experience in a static app.
    -   **URL Length Limits:** Compression and Base64 encoding help keep the URL length manageable, avoiding browser limitations.
    -   **Shareability:** Creates a self-contained URL that represents the application's state, perfect for sharing.
    -   **Libraries:** `pako` is a standard and efficient library for client-side compression/decompression.

## 3. Implementation Notes

-   **Debounce:** Debounce updates to `localStorage` and the URL hash to avoid excessive writes/updates during rapid state changes (e.g., dragging nodes).
-   **Error Handling:** Implement robust error handling for parsing data from `localStorage` and the URL hash, gracefully handling corrupted or invalid data.
-   **State Structure:** Carefully design the structure of the state object that gets persisted and encoded in the URL to include only necessary information.

This architecture provides a solid foundation for building the Graph Visualisation App, balancing features, performance, and simplicity for a client-side, statically exported Next.js application.
