import { useGraphStore } from "@/store/graphStore";
import pako from "pako";
import { useEffect, useMemo, useRef } from "react";
import { Edge, Node, Viewport } from "reactflow";

const DEBOUNCE_TIME = 500;

type ShareableState = {
	nodes: Node[];
	edges: Edge[];
	viewport: Viewport;
};

function safeBtoa(str: string): string | null {
	try {
		return btoa(str);
	} catch (e) {
		console.error("Failed to encode to Base64:", e);
		return null;
	}
}

function safeAtob(base64: string): string | null {
	try {
		return atob(base64);
	} catch (e) {
		console.error("Failed to decode from Base64:", e);
		return null;
	}
}

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

export function useUrlSharing() {
	const nodes = useGraphStore((state) => state.nodes);
	const edges = useGraphStore((state) => state.edges);
	const viewport = useGraphStore((state) => state.viewport);
	const hydrate = useGraphStore((state) => state.hydrate);
	const _isHydrated = useGraphStore((state) => state._isHydrated);

	const stateToShare: ShareableState = useMemo(
		() => ({ nodes, edges, viewport }),
		[nodes, edges, viewport]
	);

	const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const previousStateRef = useRef<ShareableState | null>(null);

	useEffect(() => {
		const isHydrated = _isHydrated;
		if (typeof window === "undefined" || isHydrated) return;

		const hash = window.location.hash.substring(1);
		if (hash) {
			const decodedString = safeAtob(hash);
			if (decodedString) {
				try {
					const uint8Array = Uint8Array.from(decodedString, (c) =>
						c.charCodeAt(0)
					);
					const decompressedJson = pako.inflate(uint8Array, {
						to: "string",
					});
					const parsedState: ShareableState =
						JSON.parse(decompressedJson);

					if (
						parsedState &&
						Array.isArray(parsedState.nodes) &&
						Array.isArray(parsedState.edges) &&
						parsedState.viewport
					) {
						hydrate(parsedState);
					} else {
						console.error(
							"Invalid data structure found in URL hash."
						);
						window.location.hash = "";
					}
				} catch (error) {
					console.error(
						"Failed to parse or decompress state from URL hash:",
						error
					);
					window.location.hash = "";
				}
			}
		}
	}, [hydrate, _isHydrated]);

	useEffect(() => {
		const isHydrated = _isHydrated;
		if (typeof window === "undefined" || !isHydrated) return;

		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
		}

		debounceTimeoutRef.current = setTimeout(() => {
			try {
				if (
					!previousStateRef.current ||
					!shallowEquals(previousStateRef.current, stateToShare)
				) {
					const stateJson = JSON.stringify(stateToShare);
					const compressed = pako.deflate(stateJson);
					const binaryString = String.fromCharCode.apply(
						null,
						Array.from(compressed)
					);
					const base64 = safeBtoa(binaryString);

					if (base64) {
						if (window.location.hash.substring(1) !== base64) {
							window.history.replaceState(null, "", `#${base64}`);
						}
					}
					previousStateRef.current = stateToShare;
				}
			} catch (error) {
				console.error("Failed to update URL hash:", error);
			}
		}, DEBOUNCE_TIME);

		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, [nodes, edges, viewport]);
}
