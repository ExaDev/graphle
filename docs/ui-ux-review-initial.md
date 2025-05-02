# UI/UX Review: Graph Visualisation App (Initial)

**Date:** 2025-05-02
**Reviewer:** UI/UX Advisor Mode

## 1. Context

This review assesses the initial UI/UX of the Graph Visualisation App based on the implementation in `src/components/Graph.tsx` and `src/components/EditableNode.tsx` (as of commit `cdf3982`). The goal is to identify areas for improvement in usability, clarity, feedback, and overall workflow.

## 2. Methodology

The review involved:
*   Code analysis of the specified React components.
*   Evaluation against standard usability heuristics (Nielsen's Heuristics) and general UI/UX best practices for graph visualisation tools.
*   Focus areas: Layout, Controls, Node/Edge Appearance, Editing Experience, Feedback, and Overall Workflow.

## 3. Findings & Recommendations

The current implementation provides core functionality but lacks polish and discoverability in several areas. The following recommendations are prioritised based on perceived impact and effort:

### High Priority

1.  **Improve Control Placement & Add MiniMap:**
    *   **Issue:** The "Add Node" button is absolutely positioned (`top: 10, left: 10`) and may overlap with graph elements or the standard React Flow controls, especially when zoomed or panned. Standard navigation controls (zoom, pan, fit view) are present via `<Controls />`, but a minimap is missing for navigating larger graphs.
    *   **Recommendation:**
        *   Relocate the "Add Node" button to a more conventional, dedicated toolbar area (e.g., top bar, sidebar) separate from the canvas.
        *   Integrate React Flow's `<MiniMap />` component to aid navigation in complex graphs.
    *   **Rationale:** Improves layout predictability, prevents control overlap (Heuristic: Aesthetic and minimalist design), and enhances navigation efficiency for larger datasets (Heuristic: Flexibility and efficiency of use).
    *   **Implementation:** Modify `Graph.tsx`. Add a dedicated toolbar component or integrate the button into an existing layout structure. Add `<MiniMap />` within the `<ReactFlow>` component.

2.  **Add Explicit Persistence Feedback:**
    *   **Issue:** The application uses `usePersistence` and `useUrlSharing` hooks, but there's no visual feedback in the UI components reviewed to indicate when the graph state is saved or when the URL is updated. Users lack confirmation that their work is safe.
    *   **Recommendation:** Implement visual feedback for save/persistence actions. This could be:
        *   A subtle "Saved" indicator (e.g., text, icon) appearing briefly after changes.
        *   Disabling a manual "Save" button temporarily while saving.
        *   A status indicator showing sync status (e.g., "Synced", "Syncing...", "Offline").
    *   **Rationale:** Provides crucial system status visibility (Heuristic: Visibility of system status) and builds user confidence.
    *   **Implementation:** Modify `usePersistence` hook or the component using it to trigger UI updates based on save status. Add UI elements to display the status.

### Medium Priority

3.  **Enhance Default Node/Edge Styling:**
    *   **Issue:** The default node style (`EditableNode.tsx`) is very basic (white box, grey border). Edges likely use React Flow defaults. This lacks visual appeal and doesn't aid differentiation.
    *   **Recommendation:**
        *   Refine the default node appearance (e.g., softer borders, subtle background colour, better typography).
        *   Consider slightly styling the default edges (e.g., colour, thickness).
        *   *Future:* Plan for distinct visual styles (colour, shape, icons) based on node types once that feature is implemented.
    *   **Rationale:** Improves visual appeal and can enhance readability and information scent, especially as complexity grows (Heuristic: Aesthetic and minimalist design).
    *   **Implementation:** Update `nodeStyle` in `EditableNode.tsx`. Add default edge options to the `<ReactFlow>` component props or define custom edge components.

4.  **Improve Discoverability of Deletion:**
    *   **Issue:** Deletion relies solely on the Backspace/Delete key (`onNodesDelete`, `onEdgesDelete` handlers in `Graph.tsx`). This is efficient but not easily discoverable for all users.
    *   **Recommendation:** Provide alternative, visible methods for deletion:
        *   Add a "Delete" button to a toolbar, active when a node/edge is selected.
        *   Include a delete icon/button directly on selected nodes (appears on selection/hover).
        *   Add a context menu (right-click) option for deletion.
    *   **Rationale:** Improves discoverability and provides alternative interaction methods (Heuristic: Flexibility and efficiency of use, Recognition rather than recall).
    *   **Implementation:** Requires adding UI elements and updating state management/event handlers to trigger `deleteElements` based on button clicks or menu actions.

5.  **Refine Inline Editing Feedback:**
    *   **Issue:** The inline editing in `EditableNode.tsx` is functional (double-click to activate, Enter/Blur to save, Esc to cancel), but the transition could be smoother.
    *   **Recommendation:**
        *   Consider a subtle visual cue on hover to indicate double-click interaction is available.
        *   Ensure the input field size dynamically matches the text length or node width appropriately.
        *   Provide brief visual feedback on successful save (e.g., a quick flash or checkmark).
    *   **Rationale:** Improves clarity of interaction and provides better feedback on state changes (Heuristic: Visibility of system status).
    *   **Implementation:** Modify `EditableNode.tsx` styles and potentially add minor state changes for feedback animations.

### Low Priority

6.  **Consider Alternative Editing Mechanisms:**
    *   **Issue:** Inline editing only supports the node label. As nodes gain more properties (type, attributes, descriptions), inline editing becomes insufficient.
    *   **Recommendation:** Plan for a more comprehensive editing mechanism for richer node data. Common patterns include:
        *   A dedicated Inspector Panel/Sidebar that displays and allows editing of the selected node's properties.
        *   A modal dialog for editing node details.
    *   **Rationale:** Scales better for more complex data models and provides a dedicated space for potentially complex editing interfaces (Heuristic: Flexibility and efficiency of use).
    *   **Implementation:** This is a larger architectural change, involving new components and potentially significant state management updates.

7.  **Explore Layouting Options:**
    *   **Issue:** Currently, nodes are likely added at a default position or (0,0) and require manual arrangement.
    *   **Recommendation:** Consider integrating automatic layout algorithms (e.g., using libraries like Dagre, ELK.js) via buttons or options. React Flow has guides on integrating these.
    *   **Rationale:** Significantly improves usability for larger or more structured graphs, reducing manual effort (Heuristic: Flexibility and efficiency of use).
    *   **Implementation:** Involves integrating a layout library and adding controls to trigger layout calculations, updating node positions accordingly.

## 4. Next Steps

*   Share this report with the development team.
*   Prioritise and plan the implementation of the recommendations, starting with High Priority items.
*   Delegate implementation tasks (e.g., to `code` mode).
