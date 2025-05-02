import React, {
	ChangeEvent,
	FocusEvent,
	KeyboardEvent,
	useCallback,
	useState,
} from "react";
import { Handle, NodeProps, Position } from "reactflow";
import { useGraphStore } from "../store/graphStore";

const baseNodeStyle = {
	border: "1px solid #bbb",
	padding: "10px 15px",
	borderRadius: 5,
	background: "#eee",
	minWidth: 150,
	textAlign: "center" as const,
};

const typeStyles: { [key: string]: React.CSSProperties } = {
	Person: { backgroundColor: "#cfe2f3" },
	Place: { backgroundColor: "#d9ead3" },
	Event: { backgroundColor: "#fff2cc" },
};

const getNodeStyle = (type?: string): React.CSSProperties => {
	const specificStyle = type ? typeStyles[type] : {};
	return { ...baseNodeStyle, ...specificStyle };
};


const inputStyle = {
	width: "100%",
	boxSizing: "border-box" as const,
};

const EditableNode: React.FC<NodeProps> = ({ id, data }) => {
	const updateNodeData = useGraphStore((state) => state.updateNodeData);
	const [isEditing, setIsEditing] = useState(false);
	const [labelValue, setLabelValue] = useState(data.label || "");

	const nodeStyle = getNodeStyle(data.type);

	const handleDoubleClick = useCallback(() => {
		setIsEditing(true);
		setLabelValue(data.label || "");
	}, [data.label]);

	const handleChange = useCallback((evt: ChangeEvent<HTMLInputElement>) => {
		setLabelValue(evt.target.value);
	}, []);

	const saveLabel = useCallback(() => {
		if (labelValue !== data.label) {
			updateNodeData(id, { label: labelValue });
		}
		setIsEditing(false);
	}, [id, labelValue, data.label, updateNodeData]);

	const handleBlur = useCallback(
		(evt: FocusEvent<HTMLInputElement>) => {
			saveLabel();
		},
		[saveLabel],
	);

	const handleKeyDown = useCallback(
		(evt: KeyboardEvent<HTMLInputElement>) => {
			if (evt.key === "Enter") {
				saveLabel();
			} else if (evt.key === "Escape") {
				setLabelValue(data.label || "");
				setIsEditing(false);
			}
		},
		[saveLabel, data.label],
	);

	return (
		<div style={nodeStyle}>
			<Handle type="target" position={Position.Top} />
			{isEditing ? (
				<input
					type="text"
					value={labelValue}
					onChange={handleChange}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					style={inputStyle}
					autoFocus
				/>
			) : (
				<div onDoubleClick={handleDoubleClick}>
					{data.label || "Edit me"}
				</div>
			)}
			<Handle type="source" position={Position.Bottom} />
		</div>
	);
};

export default EditableNode;
