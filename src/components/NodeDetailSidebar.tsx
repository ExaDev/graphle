import React from 'react';
import { useGraphStore } from '../store/graphStore';

const NodeDetailSidebar: React.FC = () => {
  const nodes = useGraphStore((state) => state.nodes);
  const selectedNode = nodes.find((node) => node.selected);

  if (!selectedNode) {
    return null;
  }

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
      <div className="space-y-2">
        <div>
          <span className="font-medium">ID:</span> {selectedNode.id}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 600 }}>Label:</span> {selectedNode.data.label ?? 'N/A'}
        </div>
        {Object.entries(selectedNode.data).map(([key, value]) => {
          if (key === 'label') return null;
          return (
            <div key={key} style={{ marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{key}:</span> {String(value)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NodeDetailSidebar;
