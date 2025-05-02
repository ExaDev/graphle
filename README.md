# Graphle

A graph based tool for grapling with relationships between dependant systems.

## Purpose

Graphle is a tool designed to help visualize complex relationships between dependent systems. It allows users to create, manage, and share projects that represent these relationships in a graphical format. This can be useful for understanding and managing physical resources, systems, issues, tickets, and more.

## Setup and Run

To set up and run the project, follow these steps:

1. Clone the repository:
    ```
    git clone https://github.com/exadev/graphle.git
    ```
2. Navigate to the project directory:
    ```
    cd graphle
    ```
3. Install the dependencies:
    ```
    npm install
    ```
4. Run the development server:
    ```
    npm run dev
    ```
5. Open your browser and navigate to `http://localhost:3000` to see the application in action.

## Using Graphle

To use Graphle to build graphs, follow these steps:

1. Create a new project by filling out the project form.
2. Add nodes and edges to the graph to represent the relationships between systems.
3. Use the canvas to visualise and manage the graph. Utilise the controls (top-left) for zooming and fitting the view, and the minimap (bottom-right) for navigation.
4. Edit a node's label by double-clicking it.
5. Edit an edge's label by clicking on the edge to select it, then modifying the label in the sidebar that appears.
6. Save the graph state to browser storage to persist your changes.
7. Delete selected nodes or edges by pressing the `Backspace` or `Delete` key.

## Sharing Projects and Views

Graphle allows you to share your projects and views using a live-updated URL. To share a project, follow these steps:

1. Make sure your project is saved and the graph state is up-to-date.
2. Copy the URL from your browser's address bar.
3. Share the URL with others. When they open the URL, they will see the same project and view that you have created.
