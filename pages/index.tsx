import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Graph from '../components/Graph';
import { saveProject, loadProject } from '../utils/storage';
import { encodeProject, decodeProject } from '../utils/url';

const IndexPage = () => {
  const [project, setProject] = useState(null);
  const [view, setView] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const { project: encodedProject, view: encodedView } = router.query;
    if (encodedProject && encodedView) {
      const decodedProject = decodeProject(encodedProject);
      const decodedView = decodeProject(encodedView);
      setProject(decodedProject);
      setView(decodedView);
    }
  }, [router.query]);

  const handleProjectChange = (newProject) => {
    setProject(newProject);
    saveProject(newProject);
    updateURL(newProject, view);
  };

  const handleViewChange = (newView) => {
    setView(newView);
    updateURL(project, newView);
  };

  const updateURL = (project, view) => {
    const encodedProject = encodeProject(project);
    const encodedView = encodeProject(view);
    router.push(`/?project=${encodedProject}&view=${encodedView}`, undefined, { shallow: true });
  };

  return (
    <div>
      <h1>Graphle</h1>
      <form>
        <label>
          Project Name:
          <input
            type="text"
            value={project?.name || ''}
            onChange={(e) => handleProjectChange({ ...project, name: e.target.value })}
          />
        </label>
      </form>
      <Graph project={project} view={view} onProjectChange={handleProjectChange} onViewChange={handleViewChange} />
    </div>
  );
};

export default IndexPage;
