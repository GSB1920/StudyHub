import { useEffect, useRef, useState } from 'react';
import { databases, storage, APPWRITE_CONFIG } from '../appwrite';
import { ID, Query, Permission, Role } from 'appwrite';
import { useNavigate } from 'react-router-dom';
import { getUser, signOut } from '../auth';

type Subject = { id: string; name: string; icon?: string; class?: string; board?: string };
type Section = { id: string; subject_id: string; name: string };
type Material = {
  id: string;
  title: string;
  type: 'pdf' | 'test' | 'sheet';
  url?: string;
  subject_id?: string;
  section_id?: string;
  category?: string;
  file_id?: string;
  file_name?: string;
  mime_type?: string;
};

const CLASSES = ['8th', '9th', '10th', '11th', '12th'];
const BOARDS = ['CBSE', 'ICSE', 'State Board'];

const theme = {
  colors: {
    primary: '#0056b3',
    onPrimary: '#FFFFFF',
    secondary: '#17a2b8',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    text: '#212529',
    textSecondary: '#495057',
    border: '#DEE2E6',
    error: '#dc3545',
  },
  borderRadius: 8,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const styles = {
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: 24,
    fontFamily: theme.fontFamily,
    color: theme.colors.text,
    background: theme.colors.background,
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  button: {
    padding: '10px 16px',
    borderRadius: theme.borderRadius,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'opacity 0.2s',
  },
  primaryButton: {
    background: theme.colors.primary,
    color: theme.colors.onPrimary,
  },
  secondaryButton: {
    background: 'transparent',
    border: `1px solid ${theme.colors.primary}`,
    color: theme.colors.primary,
  },
  input: {
    padding: '10px 12px',
    borderRadius: theme.borderRadius,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    outline: 'none',
  },
  card: {
    background: theme.colors.surface,
    borderRadius: theme.borderRadius,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    padding: 20,
  },
};

export default function Dashboard() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<Subject | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showSqlHelp, setShowSqlHelp] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'pdf' | 'test' | 'sheet'>('pdf');
  const [error, setError] = useState('');
  const [klass, setKlass] = useState<string>(CLASSES[0]);
  const [board, setBoard] = useState<string>(BOARDS[0]);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectIcon, setNewSubjectIcon] = useState('');
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isUploading, setIsUploading] = useState(false);
  const lastSubjectsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const mapDoc = (doc: any): any => ({ ...doc, id: doc.$id });

  const parseFileIdFromUrl = (url?: string) => {
    if (!url) return null;
    const match = url.match(/\/files\/([^/?]+)/i);
    return match?.[1] || null;
  };

  const getMaterialFileId = (material: Material) => material.file_id || parseFileIdFromUrl(material.url) || null;

  const getMaterialOpenUrl = (material: Material) => {
    const fileId = getMaterialFileId(material);
    if (!fileId) return material.url || '';
    return storage.getFileView(APPWRITE_CONFIG.BUCKETS.MATERIALS, fileId);
  };

  const getMaterialDownloadUrl = (material: Material) => {
    const fileId = getMaterialFileId(material);
    if (!fileId) return material.url || '';
    return storage.getFileDownload(APPWRITE_CONFIG.BUCKETS.MATERIALS, fileId);
  };

  const fetchGuestBlob = async (url: string) => {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) {
      const text = await response.text();
      let message = text || `Request failed with status ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        message = parsed?.message || message;
      } catch {}
      throw new Error(message);
    }
    return response.blob();
  };

  const needsPublicReadRepair = (message: string) =>
    message.includes('Only ["any","guests"] scopes are allowed') || message.includes('Only [\\"any\\",\\"guests\\"] scopes are allowed');

  const ensurePublicRead = async (material: Material) => {
    const fileId = getMaterialFileId(material);
    if (!fileId) return false;
    await storage.updateFile(
      APPWRITE_CONFIG.BUCKETS.MATERIALS,
      fileId,
      material.file_name || material.title || fileId,
      [Permission.read(Role.any())]
    );
    setMaterials((prev) =>
      prev.map((item) => (item.id === material.id ? { ...item, file_id: fileId } : item))
    );
    return true;
  };

  const handleOpenMaterial = async (material: Material) => {
    const openUrl = getMaterialOpenUrl(material);
    if (!openUrl) {
      setError('Material URL is missing');
      return;
    }
    try {
      const blob = await fetchGuestBlob(openUrl);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err: any) {
      const message = err?.message || 'Unknown error';
      if (needsPublicReadRepair(message)) {
        try {
          const repaired = await ensurePublicRead(material);
          if (repaired) {
            const blob = await fetchGuestBlob(getMaterialOpenUrl(material));
            const objectUrl = URL.createObjectURL(blob);
            window.open(objectUrl, '_blank', 'noopener,noreferrer');
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
            return;
          }
        } catch (repairErr: any) {
          console.error(repairErr);
          setError(`Failed to repair file permissions: ${repairErr?.message || 'Unknown error'}`);
          return;
        }
      }
      console.error(err);
      setError(`Failed to open material: ${message}`);
    }
  };

  const handleDownloadMaterial = async (material: Material) => {
    const downloadUrl = getMaterialDownloadUrl(material);
    if (!downloadUrl) {
      setError('Material URL is missing');
      return;
    }
    try {
      const blob = await fetchGuestBlob(downloadUrl);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = material.file_name || `${material.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err: any) {
      const message = err?.message || 'Unknown error';
      if (needsPublicReadRepair(message)) {
        try {
          const repaired = await ensurePublicRead(material);
          if (repaired) {
            const blob = await fetchGuestBlob(getMaterialDownloadUrl(material));
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = material.file_name || `${material.title}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
            return;
          }
        } catch (repairErr: any) {
          console.error(repairErr);
          setError(`Failed to repair file permissions: ${repairErr?.message || 'Unknown error'}`);
          return;
        }
      }
      console.error(err);
      setError(`Failed to download material: ${message}`);
    }
  };

  const loadSubjects = async (klassFilter: string = klass, boardFilter: string = board) => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.SUBJECTS,
        [
          Query.equal('class', klassFilter),
          Query.equal('board', boardFilter),
          Query.orderAsc('name')
        ]
      );
      setSubjects(response.documents.map(mapDoc));
    } catch (err: any) {
      console.error(err);
      // Don't show error if it's just that the collection doesn't exist yet (first run)
      if (err.code !== 404) {
          setError('Failed to load subjects: ' + err.message);
      }
    }
  };

  const loadSections = async (subjectId: string) => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.SECTIONS,
        [
          Query.equal('subject_id', subjectId),
          Query.orderAsc('name')
        ]
      );
      setSections(response.documents.map(mapDoc));
    } catch (err: any) {
      console.error(err);
      setError('Failed to load sections');
    }
  };

  const loadMaterials = async (subjectId: string) => {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.MATERIALS,
        [
          Query.equal('subject_id', subjectId),
          Query.orderAsc('title')
        ]
      );
      setMaterials(response.documents.map(mapDoc));
    } catch (err: any) {
      console.error(err);
      setError('Failed to load materials');
    }
  };

  useEffect(() => {
    const key = `${klass}|${board}`;
    if (lastSubjectsKeyRef.current === key) return;
    lastSubjectsKeyRef.current = key;
    loadSubjects(klass, board);
  }, [klass, board]);

  useEffect(() => {
    if (selected) {
        loadSections(selected.id);
        loadMaterials(selected.id);
    } else {
        setSections([]);
        setMaterials([]);
    }
  }, [selected]);

  const addSubject = async () => {
    if (!newSubjectName.trim()) return;
    setIsUploading(true);
    try {
      await databases.createDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.SUBJECTS,
        ID.unique(),
        {
          name: newSubjectName.trim(),
          class: klass,
          board: board,
          icon: newSubjectIcon || '📚'
        }
      );
      setNewSubjectName('');
      loadSubjects();
    } catch (err: any) {
      console.error(err);
      setError('Failed to add subject');
    }
    setIsUploading(false);
  };

  const renameSubject = async (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt('Enter new name for ' + subject.name, subject.name);
    if (!newName || newName === subject.name) return;
    
    try {
      await databases.updateDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.SUBJECTS,
        subject.id,
        { name: newName }
      );
      loadSubjects();
      if (selected?.id === subject.id) {
        setSelected({ ...subject, name: newName });
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to rename subject');
    }
  };

  const deleteSubject = async (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete ' + subject.name + '? All materials will be deleted.')) return;
    
    try {
      await databases.deleteDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.SUBJECTS,
        subject.id
      );
      loadSubjects();
      if (selected?.id === subject.id) setSelected(null);
    } catch (err: any) {
      console.error(err);
      setError('Failed to delete subject');
    }
  };

  const addSection = async () => {
    if (!selected || !newSectionName.trim()) return;
    setIsUploading(true);
    try {
      await databases.createDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.SECTIONS,
        ID.unique(),
        {
          subject_id: selected.id,
          name: newSectionName.trim()
        }
      );
      setNewSectionName('');
      loadSections(selected.id);
    } catch (err: any) {
      console.error(err);
      setError('Failed to add section');
    }
    setIsUploading(false);
  };

  const updateSection = async (id: string, newName: string) => {
    try {
      await databases.updateDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.SECTIONS,
        id,
        { name: newName }
      );
      if (selected) loadSections(selected.id);
    } catch (err: any) {
      console.error(err);
      setError('Failed to rename section');
    }
  };

  const deleteSection = async (id: string) => {
    if (!confirm('Delete this section? Materials in it will be deleted.')) return;
    try {
      await databases.deleteDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.SECTIONS,
        id
      );
      if (selected) loadSections(selected.id);
    } catch (err: any) {
      console.error(err);
      setError('Failed to delete section');
    }
  };

  const handleUpload = async (sectionId: string) => {
    if (!selected) return;
    
    const titleInput = document.getElementById(`title-${sectionId}`) as HTMLInputElement;
    const fileInput = document.getElementById(`file-${sectionId}`) as HTMLInputElement;
    
    const titleVal = titleInput?.value;
    const file = fileInput?.files?.[0];
    
    if (!titleVal) {
        alert('Please enter a title');
        return;
    }
    
    if (!file) {
        alert('Please select a file');
        return;
    }
    
    setIsUploading(true);
    
    try {
      // Upload file
      const fileId = ID.unique();
      await storage.createFile(
        APPWRITE_CONFIG.BUCKETS.MATERIALS,
        fileId,
        file,
        [Permission.read(Role.any())]
      );
        
      const publicUrl = storage.getFileView(
        APPWRITE_CONFIG.BUCKETS.MATERIALS,
        fileId
      );
        
      // Insert material record
      try {
        await databases.createDocument(
          APPWRITE_CONFIG.DATABASE_ID,
          APPWRITE_CONFIG.COLLECTIONS.MATERIALS,
          ID.unique(),
          {
            subject_id: selected.id,
            section_id: sectionId,
            title: titleVal,
            type: file.type === 'application/pdf' ? 'pdf' : 'sheet',
            url: publicUrl,
            file_id: fileId,
            file_name: file.name,
            mime_type: file.type || null
          }
        );
      } catch (insertErr: any) {
        if (insertErr.message && insertErr.message.includes('Unknown attribute')) {
          // Fallback for older schemas that don't have file_id, file_name, mime_type
          await databases.createDocument(
            APPWRITE_CONFIG.DATABASE_ID,
            APPWRITE_CONFIG.COLLECTIONS.MATERIALS,
            ID.unique(),
            {
              subject_id: selected.id,
              section_id: sectionId,
              title: titleVal,
              type: file.type === 'application/pdf' ? 'pdf' : 'sheet',
              url: publicUrl
            }
          );
        } else {
          throw insertErr;
        }
      }
        
      titleInput.value = '';
      fileInput.value = '';
      loadMaterials(selected.id);
    } catch (err: any) {
      console.error(err);
      setError('Failed to upload file or save record: ' + err.message);
    }
    setIsUploading(false);
  };

  const startEditing = (material: Material) => {
    setEditingMaterialId(material.id);
    setEditingTitle(material.title);
  };

  const cancelEdit = () => {
    setEditingMaterialId(null);
    setEditingTitle('');
  };

  const saveEdit = async () => {
    if (!editingMaterialId) return;
    
    try {
      await databases.updateDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.MATERIALS,
        editingMaterialId,
        { title: editingTitle }
      );
      setEditingMaterialId(null);
      setEditingTitle('');
      if (selected) loadMaterials(selected.id);
    } catch (err: any) {
      console.error(err);
      setError('Failed to update material');
    }
  };

  const deleteMaterial = async (id: string) => {
    if (!confirm('Delete this material?')) return;
    
    try {
      await databases.deleteDocument(
        APPWRITE_CONFIG.DATABASE_ID,
        APPWRITE_CONFIG.COLLECTIONS.MATERIALS,
        id
      );
      if (selected) loadMaterials(selected.id);
    } catch (err: any) {
      console.error(err);
      setError('Failed to delete material');
    }
  };

  const [showSidebar, setShowSidebar] = useState(!isMobile);

  useEffect(() => {
    if (isMobile && selected) setShowSidebar(false);
    if (isMobile && !selected) setShowSidebar(true);
  }, [selected, isMobile]);

  const navigate = useNavigate();

  const logout = () => {
    signOut();
    navigate('/', { replace: true });
  };

  return (
    <div style={{...styles.container, padding: isMobile ? 16 : 24}}>
      <div style={{...styles.header, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0, alignItems: isMobile ? 'flex-start' : 'center'}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            {isMobile && selected && (
                <button onClick={() => { setSelected(null); setShowSidebar(true); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
            )}
            <h2 style={{ margin: 0, color: theme.colors.primary, flex: 1 }}>StudyHub Admin</h2>
            <button onClick={logout} style={{ ...styles.button, ...styles.secondaryButton, padding: '6px 12px', fontSize: 14 }}>Logout</button>
        </div>
      </div>
      
      {error ? <div style={{ color: theme.colors.error, marginBottom: 16, padding: 12, background: '#fee2e2', borderRadius: 8 }}>{error}</div> : null}
      
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: 24 }}>
        
        {/* Sidebar / Subject List */}
        {(!isMobile || showSidebar) && (
            <div style={{ ...styles.card, padding: 0, overflow: 'hidden', height: isMobile ? 'auto' : 'fit-content' }}>
              <div style={{ padding: 16, borderBottom: `1px solid ${theme.colors.border}`, background: '#f8f9fa' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Subjects</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexDirection: isMobile ? 'column' : 'row' }}>
                  <select value={klass} onChange={e => setKlass(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                    {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={board} onChange={e => setBoard(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                    {BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="New Subject" style={{ ...styles.input, flex: 2 }} disabled={isUploading} />
                  <button onClick={addSubject} style={{ ...styles.button, ...styles.primaryButton, padding: '8px 12px' }} disabled={isUploading}>+</button>
                </div>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
                {subjects.map(s => (
                  <li 
                    key={s.id} 
                    style={{ 
                      padding: '12px 16px', 
                      cursor: 'pointer', 
                      background: selected?.id === s.id ? '#e7f1ff' : 'transparent',
                      borderBottom: `1px solid ${theme.colors.border}`,
                      color: selected?.id === s.id ? theme.colors.primary : theme.colors.text,
                      fontWeight: selected?.id === s.id ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8
                    }} 
                    onClick={() => { setSelected(s); if(isMobile) setShowSidebar(false); }}
                  >
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button 
                        onClick={(e) => renameSubject(s, e)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, padding: 4, opacity: 0.6 }}
                        title="Rename"
                      >
                        ✎
                      </button>
                      <button 
                        onClick={(e) => deleteSubject(s, e)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, padding: 4, opacity: 0.6 }}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
        )}
        
        {/* Main Content Area */}
        {(!isMobile || !showSidebar) && (
            <div style={{ ...styles.card, border: isMobile ? 'none' : styles.card.border, boxShadow: isMobile ? 'none' : styles.card.boxShadow, padding: isMobile ? 0 : 20, background: isMobile ? 'transparent' : theme.colors.surface }}>
              {selected ? (
                <>
                  <div style={{ marginBottom: 24, borderBottom: `1px solid ${theme.colors.border}`, paddingBottom: 16 }}>
                     <h3 style={{ margin: 0, fontSize: 24 }}>{selected.name}</h3>
                     <p style={{ margin: '4px 0 0 0', color: theme.colors.textSecondary }}>Manage study materials and sections</p>
                  </div>

                  {/* Add New Section/Group */}
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 24, padding: 20, background: '#f8f9fa', borderRadius: theme.borderRadius, alignItems: isMobile ? 'stretch' : 'center' }}>
                     <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: theme.colors.textSecondary, textTransform: 'uppercase' }}>Create New Section</label>
                        <input 
                            value={newSectionName} 
                            onChange={e => setNewSectionName(e.target.value)} 
                            placeholder="e.g. Chapter 1: Real Numbers" 
                            style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }} 
                            disabled={isUploading}
                        />
                     </div>
                     <div style={{ alignSelf: isMobile ? 'stretch' : 'flex-end' }}>
                        <button onClick={addSection} style={{ ...styles.button, ...styles.primaryButton, width: isMobile ? '100%' : 'auto' }} disabled={isUploading}>
                            {isUploading ? 'Creating...' : 'Create Group'}
                        </button>
                     </div>
                  </div>

                  {/* List Sections */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {sections.map(section => (
                      <div key={section.id} style={{ border: `1px solid ${theme.colors.border}`, borderRadius: theme.borderRadius, overflow: 'hidden', background: theme.colors.surface }}>
                        {/* Section Header */}
                        <div style={{ background: '#f1f3f5', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.border}` }}>
                           <h4 style={{ margin: 0, color: theme.colors.primary, fontSize: 16 }}>{section.name}</h4>
                           <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => {
                                 const newName = prompt('Rename group:', section.name);
                                 if (newName && newName !== section.name) updateSection(section.id, newName);
                              }} style={{ cursor: 'pointer', padding: '4px 8px', fontSize: 12, border: 'none', background: 'transparent', color: theme.colors.textSecondary }}>Edit</button>
                              <button onClick={() => deleteSection(section.id)} style={{ cursor: 'pointer', padding: '4px 8px', fontSize: 12, color: theme.colors.error, border: 'none', background: 'transparent' }}>Remove</button>
                           </div>
                        </div>

                        {/* Section Content (Add Material + List) */}
                        <div style={{ padding: 20 }}>
                           {/* Add Material Form */}
                           <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 16, alignItems: 'center', background: '#f8f9fa', padding: 16, borderRadius: theme.borderRadius }}>
                              <div style={{ flex: 1, width: isMobile ? '100%' : 'auto' }}>
                                <input id={`title-${section.id}`} placeholder="Material Title (Required)" style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }} />
                              </div>
                              <div style={{ flex: 1, width: isMobile ? '100%' : 'auto' }}>
                                <input type="file" id={`file-${section.id}`} disabled={isUploading} style={{ fontSize: 14, width: '100%' }} />
                              </div>
                              <button onClick={() => handleUpload(section.id)} style={{ ...styles.button, ...styles.primaryButton, padding: '8px 16px', width: isMobile ? '100%' : 'auto' }} disabled={isUploading}>
                                {isUploading ? 'Uploading...' : 'Add Material'}
                              </button>
                           </div>

                           {/* Materials List */}
                           <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                              {materials.filter(m => m.section_id === section.id).map(m => (
                                 <li key={m.id} style={{ padding: '12px 0', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 8 : 0 }}>
                                    {editingMaterialId === m.id ? (
                                      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: 'center', width: '100%' }}>
                                        <input 
                                          value={editingTitle} 
                                          onChange={e => setEditingTitle(e.target.value)} 
                                          style={{ ...styles.input, flex: 1, width: isMobile ? '100%' : 'auto' }} 
                                        />
                                        <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                                            <button onClick={saveEdit} style={{ ...styles.button, ...styles.primaryButton, padding: '6px 12px', fontSize: 12, flex: 1 }}>Save</button>
                                            <button onClick={cancelEdit} style={{ ...styles.button, ...styles.secondaryButton, padding: '6px 12px', fontSize: 12, color: theme.colors.textSecondary, borderColor: theme.colors.border, flex: 1 }}>Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                            <span style={{ background: '#e9ecef', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: theme.colors.textSecondary }}>{m.type.toUpperCase()}</span>
                                            <span style={{ fontWeight: 500, flex: 1, wordBreak: 'break-word' }}>{m.title}</span>
                                            {m.url && (
                                              <button
                                                onClick={() => handleOpenMaterial(m)}
                                                style={{ cursor: 'pointer', padding: '4px 8px', fontSize: 12, border: 'none', background: 'transparent', color: theme.colors.primary, whiteSpace: 'nowrap' }}
                                              >
                                                Open
                                              </button>
                                            )}
                                            {m.url && (
                                              <button
                                                onClick={() => handleDownloadMaterial(m)}
                                                style={{ cursor: 'pointer', padding: '4px 8px', fontSize: 12, border: 'none', background: 'transparent', color: theme.colors.primary, whiteSpace: 'nowrap' }}
                                              >
                                                Download
                                              </button>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignSelf: isMobile ? 'flex-end' : 'auto' }}>
                                          <button onClick={() => startEditing(m)} style={{ cursor: 'pointer', padding: '4px 8px', fontSize: 12, border: 'none', background: 'transparent', color: theme.colors.textSecondary }}>Edit</button>
                                          <button onClick={() => deleteMaterial(m.id)} style={{ color: theme.colors.error, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}>&times;</button>
                                        </div>
                                      </>
                                    )}
                                 </li>
                              ))}
                              {materials.filter(m => m.section_id === section.id).length === 0 && (
                                 <li style={{ color: theme.colors.textSecondary, fontStyle: 'italic', padding: 12, textAlign: 'center', background: '#f8f9fa', borderRadius: 4 }}>No materials in this group yet.</li>
                              )}
                           </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, color: theme.colors.textSecondary }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
                    <p>Select a subject to manage content.</p>
                </div>
              )}
            </div>
        )}
      </div>
    </div>
  );
}
