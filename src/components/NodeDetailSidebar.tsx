import React, { useState, useEffect, ChangeEvent, KeyboardEvent } from 'react';
import { useGraphStore } from '../store/graphStore';

const NodeDetailSidebar: React.FC = () => {
	const nodes = useGraphStore((state) => state.nodes);
	const updateNodeData = useGraphStore((state) => state.updateNodeData);
	const selectedNode = nodes.find((node) => node.selected);

	const [label, setLabel] = useState<string>("");
	const [type, setType] = useState<string>("");

	// Update local state when the selected node changes
	useEffect(() => {
		if (selectedNode) {
			setLabel(selectedNode.data.label ?? "");
			setType(selectedNode.data.type ?? "");
		}
	}, [selectedNode]);

 if (!selectedNode) {
  return null;
 }

 const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
  setLabel(event.target.value);
 };

 const handleTypeChange = (event: ChangeEvent<HTMLInputElement>) => {
  setType(event.target.value);
 };

 const handleSave = (field: 'label' | 'type', value: string) => {
  if (selectedNode) {
  	updateNodeData(selectedNode.id, { [field]: value });
  }
 };

 const handleKeyDown = (
  event: KeyboardEvent<HTMLInputElement>,
  field: 'label' | 'type'
 ) => {
  if (event.key === 'Enter') {
  	handleSave(field, (event.target as HTMLInputElement).value);
  	(event.target as HTMLInputElement).blur(); // Remove focus after saving
  }
 };

 const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  border: '1px solid #e2e8f0',
  borderRadius: '0.25rem',
  marginBottom: '0.75rem',
 };

 const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginBottom: '0.25rem',
 };

 const sidebarStyle: React.CSSProperties = {
  position: 'fixed',
    top: 0,
    right: 0,
    height: '100%',
    width: '250px',
    backgroundColor: '#f7fafc',
    padding: '1rem',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
    borderLeft: '1px solid #e2e8f0',
    zIndex: 10,
    overflowY: 'auto',
  };

 return (
  <div style={sidebarStyle}>
  	<h2 className="text-lg font-semibold mb-4">Node Details</h2>
  	<div className="space-y-4">
  		<div>
  			<span className="font-medium">ID:</span> {selectedNode.id}
  		</div>
  		<div>
  			<label htmlFor="node-label-input" style={labelStyle}>
  				Label:
  			</label>
  			<input
  				id="node-label-input"
  				type="text"
  				value={label}
  				onChange={handleLabelChange}
  				onBlur={(e) => handleSave('label', e.target.value)}
  				onKeyDown={(e) => handleKeyDown(e, 'label')}
  				style={inputStyle}
  				className="border rounded px-2 py-1 w-full"
  			/>
  		</div>
  		<div>
  			<label htmlFor="node-type-input" style={labelStyle}>
  				Type:
  			</label>
  			<input
  				id="node-type-input"
  				type="text"
  				value={type}
  				onChange={handleTypeChange}
  				onBlur={(e) => handleSave('type', e.target.value)}
  				onKeyDown={(e) => handleKeyDown(e, 'type')}
  				style={inputStyle}
  				className="border rounded px-2 py-1 w-full"
  			/>
  		</div>
  		{/* Display other data properties non-editably */}
  		{Object.entries(selectedNode.data)
  			.filter(([key]) => key !== 'label' && key !== 'type')
  			.map(([key, value]) => (
  				<div key={key}>
  					<span
  						style={{
  							fontWeight: 600,
  							textTransform: 'capitalize',
  						}}
  					>
  						{key}:
  					</span>{" "}
  					{String(value)}
  				</div>
  			))}
  	</div>
  </div>
 );
};

export default NodeDetailSidebar;
