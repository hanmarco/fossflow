import { useState, useEffect, useRef, useCallback } from 'react';
import { Isoflow } from 'fossflow';
import { flattenCollections } from '@isoflow/isopacks/dist/utils';
import isoflowIsopack from '@isoflow/isopacks/dist/isoflow';
import awsIsopack from '@isoflow/isopacks/dist/aws';
import gcpIsopack from '@isoflow/isopacks/dist/gcp';
import azureIsopack from '@isoflow/isopacks/dist/azure';
import kubernetesIsopack from '@isoflow/isopacks/dist/kubernetes';
import { DiagramData, mergeDiagramData, extractSavableData } from './diagramUtils';
import { StorageManager } from './StorageManager';
import './App.css';

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke(channel: string, ...args: any[]): Promise<any>;
        send(channel: string, ...args: any[]): void;
        on(channel: string, listener: (...args: any[]) => void): void;
        once(channel: string, listener: (...args: any[]) => void): void;
        removeAllListeners(channel: string): void;
      };
    };
  }
}

const icons = flattenCollections([
  isoflowIsopack,
  awsIsopack,
  azureIsopack,
  gcpIsopack,
  kubernetesIsopack
]);


interface SavedDiagram {
  id: string;
  name: string;
  data: any;
  createdAt: string;
  updatedAt: string;
}

function App() {
  const [diagrams, setDiagrams] = useState<SavedDiagram[]>([]);
  const [currentDiagram, setCurrentDiagram] = useState<SavedDiagram | null>(null);
  const [diagramName, setDiagramName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const diagramNameInputRef = useRef<HTMLInputElement>(null);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  
  const [fossflowKey, setFossflowKey] = useState(0); // Key to force re-render of FossFLOW
  const [currentModel, setCurrentModel] = useState<DiagramData | null>(null); // Store current model state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [showStorageManager, setShowStorageManager] = useState(false);
  
  // Initialize with empty diagram data
  // Create default colors for connectors
  const defaultColors = [
    { id: 'blue', value: '#0066cc' },
    { id: 'green', value: '#00aa00' },
    { id: 'red', value: '#cc0000' },
    { id: 'orange', value: '#ff9900' },
    { id: 'purple', value: '#9900cc' },
    { id: 'black', value: '#000000' },
    { id: 'gray', value: '#666666' }
  ];
  
  
  const [diagramData, setDiagramData] = useState<DiagramData>({
    title: 'Untitled Diagram',
    icons: icons, // Keep full icon set for FossFLOW
    colors: defaultColors,
    items: [],
    views: [],
    fitToScreen: true
  });

  // Load diagrams from localStorage on component mount
  useEffect(() => {
    const savedDiagrams = localStorage.getItem('fossflow-diagrams');
    if (savedDiagrams) {
      setDiagrams(JSON.parse(savedDiagrams));
    }
    
    // Load last opened diagram
    const lastOpenedId = localStorage.getItem('fossflow-last-opened');
    const lastOpenedData = localStorage.getItem('fossflow-last-opened-data');
    
    if (lastOpenedId && lastOpenedData) {
      try {
        const data = JSON.parse(lastOpenedData);
        // Always include full icon set
        const dataWithIcons = {
          ...data,
          icons: icons // Replace with full icon set
        };
        setDiagramData(dataWithIcons);
        setCurrentModel(dataWithIcons);
        
        // Find and set the diagram metadata
        if (savedDiagrams) {
          const allDiagrams = JSON.parse(savedDiagrams);
          const lastDiagram = allDiagrams.find((d: SavedDiagram) => d.id === lastOpenedId);
          if (lastDiagram) {
            setCurrentDiagram(lastDiagram);
            setDiagramName(lastDiagram.name);
          }
        }
      } catch (e) {
        console.error('Failed to restore last diagram:', e);
      }
    }
  }, []);

  // Setup menu event listeners for Electron
  useEffect(() => {
    const setupListeners = () => {
      if (window.electron && window.electron.ipcRenderer) {
        try {
          // New Diagram menu item
          window.electron.ipcRenderer.on('menu-new-diagram', () => {
            newDiagram();
          });

          // Open File menu item
          window.electron.ipcRenderer.on('menu-open-file', () => {
            handleOpenFile();
          });

          // Save File menu item
          window.electron.ipcRenderer.on('menu-save-file', () => {
            handleSaveFile();
          });
        } catch (error) {
          console.error('IPC 리스너 등록 중 오류:', error);
        }
      } else {
        // 1초 후 다시 시도
        setTimeout(setupListeners, 1000);
      }
    };

    setupListeners();

    // Cleanup listeners on unmount
    return () => {
      if (window.electron && window.electron.ipcRenderer) {
        try {
          window.electron.ipcRenderer.removeAllListeners('menu-new-diagram');
          window.electron.ipcRenderer.removeAllListeners('menu-open-file');
          window.electron.ipcRenderer.removeAllListeners('menu-save-file');
        } catch (error) {
          console.error('IPC 리스너 정리 중 오류:', error);
        }
      }
    };
  }, []);

    // Save diagrams to localStorage whenever they change
  useEffect(() => {
    try {
      // Store diagrams without the full icon data
      const diagramsToStore = diagrams.map(d => ({
        ...d,
        data: {
          ...d.data,
          icons: [] // Don't store icons with each diagram
        }
      }));
      localStorage.setItem('fossflow-diagrams', JSON.stringify(diagramsToStore));
    } catch (e) {
      console.error('Failed to save diagrams:', e);
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        alert('Storage quota exceeded. Please export important diagrams and clear some space.');
      }
    }
  }, [diagrams]);

  const saveDiagram = () => {
    if (!diagramName.trim()) {
      alert('Please enter a diagram name');
      return;
    }

    // Construct save data WITHOUT icons (they're loaded separately)
    const savedData = {
      title: diagramName,
      icons: [], // Don't save icons with diagram
      colors: currentModel?.colors || diagramData.colors || [],
      items: currentModel?.items || diagramData.items || [],
      views: currentModel?.views || diagramData.views || [],
      fitToScreen: true
    };
    

    const newDiagram: SavedDiagram = {
      id: currentDiagram?.id || Date.now().toString(),
      name: diagramName,
      data: savedData,
      createdAt: currentDiagram?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (currentDiagram) {
      // Update existing diagram
      setDiagrams(diagrams.map(d => d.id === currentDiagram.id ? newDiagram : d));
    } else {
      // Add new diagram
      setDiagrams([...diagrams, newDiagram]);
    }

    setCurrentDiagram(newDiagram);
    setShowSaveDialog(false);
    setHasUnsavedChanges(false);
    setLastAutoSave(new Date());
    
    // Save as last opened
    try {
      localStorage.setItem('fossflow-last-opened', newDiagram.id);
      localStorage.setItem('fossflow-last-opened-data', JSON.stringify(newDiagram.data));
    } catch (e) {
      console.error('Failed to save diagram:', e);
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        alert('Storage full! Opening Storage Manager...');
        setShowStorageManager(true);
      }
    }
  };

  const loadDiagram = (diagram: SavedDiagram) => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Continue loading?')) {
      return;
    }
    
    // Always ensure icons are present when loading
    const dataWithIcons = {
      ...diagram.data,
      icons: icons // Replace with full icon set
    };
    
    setCurrentDiagram(diagram);
    setDiagramName(diagram.name);
    setDiagramData(dataWithIcons);
    setCurrentModel(dataWithIcons);
    setFossflowKey(prev => prev + 1); // Force re-render of FossFLOW
    setShowLoadDialog(false);
    setHasUnsavedChanges(false);
    
    // Save as last opened (without icons)
    try {
      localStorage.setItem('fossflow-last-opened', diagram.id);
      localStorage.setItem('fossflow-last-opened-data', JSON.stringify(diagram.data));
    } catch (e) {
      console.error('Failed to save last opened:', e);
    }
  };

  const deleteDiagram = (id: string) => {
    if (window.confirm('Are you sure you want to delete this diagram?')) {
      setDiagrams(diagrams.filter(d => d.id !== id));
      if (currentDiagram?.id === id) {
        setCurrentDiagram(null);
        setDiagramName('');
      }
    }
  };

  const newDiagram = useCallback(() => {
    const message = hasUnsavedChanges 
      ? 'You have unsaved changes. Export your diagram first to save it. Continue?'
      : 'Create a new diagram?';
      
    if (window.confirm(message)) {
      const emptyDiagram: DiagramData = {
        title: 'Untitled Diagram',
        icons: icons, // Always include full icon set
        colors: defaultColors,
        items: [],
        views: [],
        fitToScreen: true
      };
      setCurrentDiagram(null);
      setDiagramName('');
      setDiagramData(emptyDiagram);
      setCurrentModel(emptyDiagram); // Reset current model too
      setFossflowKey(prev => prev + 1); // Force re-render of FossFLOW
      setHasUnsavedChanges(false);
      
      // Clear last opened
      localStorage.removeItem('fossflow-last-opened');
      localStorage.removeItem('fossflow-last-opened-data');
    }
  }, [hasUnsavedChanges, defaultColors]);

  const handleModelUpdated = (model: any) => {
    // Store the current model state whenever it updates
    // Model update received
    
    // Deep merge the model update with our current state
    // This handles both complete and partial updates
    setCurrentModel((prevModel: DiagramData | null) => {
      const merged = {
        // Start with previous model or diagram data
        ...(prevModel || diagramData),
        // Override with any new data from the model update
        ...model,
        // Ensure we always have required fields
        title: model.title || prevModel?.title || diagramData.title || diagramName || 'Untitled',
        // Keep icons in the data structure for FossFLOW to work
        icons: icons, // Always use full icon set
        colors: model.colors || prevModel?.colors || diagramData.colors || [],
        // These fields likely come from the model update
        items: model.items !== undefined ? model.items : (prevModel?.items || diagramData.items || []),
        views: model.views !== undefined ? model.views : (prevModel?.views || diagramData.views || []),
        fitToScreen: true
      };
      setHasUnsavedChanges(true);
      return merged;
    });
  };

  const handleOpenFile = useCallback(async () => {
    const result = await window.electron.ipcRenderer.invoke('open-file-dialog');
    if (result) {
      const { content } = result;
      try {
        const parsedData = JSON.parse(content);
        const mergedData: DiagramData = {
          ...parsedData,
          title: parsedData.title || 'Imported Diagram',
          icons: icons,
          colors: parsedData.colors?.length ? parsedData.colors : defaultColors,
          fitToScreen: parsedData.fitToScreen !== false
        };
        setDiagramData(mergedData);
        setDiagramName(parsedData.title || 'Imported Diagram');
        setCurrentModel(mergedData);
        setFossflowKey(prev => prev + 1);
        setHasUnsavedChanges(true);
        alert(`Diagram "${parsedData.title || 'Untitled'}" loaded successfully!`);
      } catch (error) {
        alert('Invalid JSON file. Please check the file format.');
      }
    }
  }, [defaultColors]);

  const handleSaveFile = useCallback(async () => {
    const exportData = {
      title: diagramName || currentModel?.title || diagramData.title || 'Exported Diagram',
      icons: icons,
      colors: currentModel?.colors || diagramData.colors || [],
      items: currentModel?.items || diagramData.items || [],
      views: currentModel?.views || diagramData.views || [],
      fitToScreen: true
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    const filePath = await window.electron.ipcRenderer.invoke('save-file-dialog', jsonString);
    if (filePath) {
      alert(`Diagram saved to ${filePath}`);
      setHasUnsavedChanges(false);
    }
  }, [diagramName, currentModel, diagramData]);

  
  
  // Auto-save functionality
  useEffect(() => {
    if (!currentModel || !hasUnsavedChanges || !currentDiagram) return;
    
    const autoSaveTimer = setTimeout(() => {
      const savedData = {
        title: diagramName || currentDiagram.name,
        icons: [], // Don't save icons in auto-save
        colors: currentModel.colors || [],
        items: currentModel.items || [],
        views: currentModel.views || [],
        fitToScreen: true
      };
      
      const updatedDiagram: SavedDiagram = {
        ...currentDiagram,
        data: savedData,
        updatedAt: new Date().toISOString()
      };
      
      setDiagrams(prevDiagrams => 
        prevDiagrams.map(d => d.id === currentDiagram.id ? updatedDiagram : d)
      );
      
      // Update last opened data
      try {
        localStorage.setItem('fossflow-last-opened-data', JSON.stringify(savedData));
        setLastAutoSave(new Date());
        setHasUnsavedChanges(false);
      } catch (e) {
        console.error('Auto-save failed:', e);
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          alert('Storage full! Please use Storage Manager to free up space.');
          setShowStorageManager(true);
        }
      }
    }, 5000); // Auto-save after 5 seconds of changes
    
    return () => clearTimeout(autoSaveTimer);
  }, [currentModel, hasUnsavedChanges, currentDiagram, diagramName, icons]);
  
  // Warn before closing if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Focus on the input field when the save dialog opens
  useEffect(() => {
    if (showSaveDialog && diagramNameInputRef.current) {
      diagramNameInputRef.current.focus();
    }
  }, [showSaveDialog]);

  return (
    <div className="App">
      <div className="toolbar">
        <button onClick={newDiagram}>New Diagram</button>
        <button onClick={() => setShowSaveDialog(true)}>Save (Session Only)</button>
        <button onClick={() => setShowLoadDialog(true)}>Load (Session Only)</button>
        <button onClick={handleOpenFile}>📂 Open File</button>
        <button onClick={handleSaveFile}>💾 Save File</button>
        
        <button 
          onClick={() => {
            if (currentDiagram && hasUnsavedChanges) {
              saveDiagram();
            }
          }}
          disabled={!currentDiagram || !hasUnsavedChanges}
          style={{ 
            backgroundColor: currentDiagram && hasUnsavedChanges ? '#ffc107' : '#6c757d',
            opacity: currentDiagram && hasUnsavedChanges ? 1 : 0.5,
            cursor: currentDiagram && hasUnsavedChanges ? 'pointer' : 'not-allowed'
          }}
          title="Save to current session only"
        >
          Quick Save (Session)
        </button>
        <span className="current-diagram">
          {currentDiagram ? `Current: ${currentDiagram.name}` : diagramName || 'Untitled Diagram'}
          {hasUnsavedChanges && <span style={{ color: '#ff9800', marginLeft: '10px' }}>• Modified</span>}
          <span style={{ fontSize: '12px', color: '#666', marginLeft: '10px' }}>
            (Session storage only - export to save permanently)
          </span>
        </span>
      </div>

      <div className="fossflow-container">
        <Isoflow 
          key={fossflowKey}
          initialData={diagramData}
          onModelUpdated={handleModelUpdated}
          editorMode="EDITABLE"
        />
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>Save Diagram (Current Session Only)</h2>
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeeba',
              padding: '15px',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <strong>⚠️ Important:</strong> This save is temporary and will be lost when you close the browser.
              <br />
              Use <strong>Export File</strong> to permanently save your work.
            </div>
            <input
              type="text"
              placeholder="Enter diagram name"
              value={diagramName}
              onChange={(e) => setDiagramName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveDiagram()}
              ref={diagramNameInputRef}
            />
            <div className="dialog-buttons">
              <button onClick={saveDiagram}>Save</button>
              <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>Load Diagram (Current Session Only)</h2>
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeeba',
              padding: '15px',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <strong>⚠️ Note:</strong> These saves are temporary. Export your diagrams to keep them permanently.
            </div>
            <div className="diagram-list">
              {diagrams.length === 0 ? (
                <p>No saved diagrams found in this session</p>
              ) : (
                diagrams.map(diagram => (
                  <div key={diagram.id} className="diagram-item">
                    <div>
                      <strong>{diagram.name}</strong>
                      <br />
                      <small>Updated: {new Date(diagram.updatedAt).toLocaleString()}</small>
                    </div>
                    <div className="diagram-actions">
                      <button onClick={() => loadDiagram(diagram)}>Load</button>
                      <button onClick={() => deleteDiagram(diagram.id)}>Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="dialog-buttons">
              <button onClick={() => setShowLoadDialog(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      
      
      

      

      {/* Storage Manager */}
      {showStorageManager && (
        <StorageManager onClose={() => setShowStorageManager(false)} />
      )}
    </div>
  );
}

export default App;
