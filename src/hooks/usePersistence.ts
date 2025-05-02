import { useGraphStore } from "@/store/graphStore";
import { useEffect, useRef } from "react";
import { Edge, Node, Viewport } from "reactflow";

const DEBOUNCE_TIME = 500;
const LOCAL_STORAGE_KEY = "graphAppState";

type PersistentState = {
	nodes: Node[];
	edges: Edge[];
	viewport: Viewport;
};

function shallowEquals(objA: any, objB: any): boolean {
	if (objA === objB) return true;
	if (!objA || !objB) return false;
	const keysA = Object.keys(objA);
	const keysB = Object.keys(objB);
	if (keysA.length !== keysB.length) return false;
	for (const key of keysA) {
		if (
			!Object.prototype.hasOwnProperty.call(objB, key) ||
			objA[key] !== objB[key]
		) {
			return false;
		}
	}
	return true;
}

export function usePersistence() {
	const nodes = useGraphStore((state) => state.nodes);
	const edges = useGraphStore((state) => state.edges);
	const viewport = useGraphStore((state) => state.viewport);
	const hydrate = useGraphStore((state) => state.hydrate);
	const _isHydrated = useGraphStore((state) => state._isHydrated);
	const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const previousNodesRef = useRef<Node[] | null>(null);
	const previousEdgesRef = useRef<Edge[] | null>(null);
	const previousViewportRef = useRef<Viewport | null>(null);

	useEffect(() => {
		if (_isHydrated) return;

		const savedStateRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
		if (savedStateRaw) {
			try {
				const savedState: PersistentState = JSON.parse(savedStateRaw);
				if (
					savedState &&
					Array.isArray(savedState.nodes) &&
					Array.isArray(savedState.edges) &&
					savedState.viewport
				) {
					hydrate(savedState);
					previousNodesRef.current = savedState.nodes;
					previousEdgesRef.current = savedState.edges;
					previousViewportRef.current = savedState.viewport;
					console.log("Hydrated state from localStorage.");
				} else {
					console.error(
						"Invalid data found in localStorage for key:",
						LOCAL_STORAGE_KEY
					);
					localStorage.removeItem(LOCAL_STORAGE_KEY);
				}
			} catch (error) {
				console.error(
					"Failed to parse graph state from localStorage:",
					error
				);
				localStorage.removeItem(LOCAL_STORAGE_KEY);
			}
		}
	}, [hydrate, _isHydrated]);

	useEffect(() => {
		if (!_isHydrated) return;

		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
		}

		debounceTimeoutRef.current = setTimeout(() => {
			try {
				const nodesChanged = previousNodesRef.current !== nodes;
				const edgesChanged = previousEdgesRef.current !== edges;
				const viewportChanged =
					previousViewportRef.current !== viewport;

				if (nodesChanged || edgesChanged || viewportChanged) {
					const stateToSave: PersistentState = {
						nodes,
						edges,
						viewport,
					};
					const stateJson = JSON.stringify(stateToSave);
					localStorage.setItem(LOCAL_STORAGE_KEY, stateJson);
					previousNodesRef.current = nodes;
					previousEdgesRef.current = edges;
					previousViewportRef.current = viewport;
				}
			} catch (error) {
				console.error(
					"Failed to save graph state to localStorage:",
					error
				);
			}
		}, DEBOUNCE_TIME);

		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, [nodes, edges, viewport, _isHydrated]);
}
