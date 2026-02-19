import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { getUser, signOut } from '../auth';

type Subject = { id: string; name: string; icon?: string; class?: string; board?: string };
type Section = { id: string; subject_id: string; name: string };
type Material = { id: string; title: string; type: 'pdf' | 'test' | 'sheet'; url?: string; subject_id?: string; section_id?: string; category?: string };

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
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [klass, setKlass] = useState<string>(CLASSES[0]);
  const [board, setBoard] = useState<string>(BOARDS[0]);
  const [category, setCategory] = useState('');
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

  const loadSubjects = async (klassFilter: string = klass, boardFilter: string = board) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('class', klassFilter)
      .eq('board', boardFilter)
      .order('name');
    if (error) {
        console.error(error);
        setError('Failed to load subjects');
    } else {
        setSubjects(data || []);
    }
  };

  const loadSections = async (subjectId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.from('sections').select('*').eq('subject_id', subjectId).order('name');
    if (error) {
        console.error(error);
        setError('Failed to load sections');
    } else {
        setSections(data || []);
    }
  };

  const loadMaterials = async (subjectId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.from('materials').select('*').eq('subject_id', subjectId).order('title');
    if (error) {
        console.error(error);
        setError('Failed to load materials');
    } else {
        setMaterials(data || []);
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
    if (!newSubjectName.trim() || !supabase) return;
    setIsUploading(true);
    const { error } = await supabase.from('subjects').insert({
        name: newSubjectName.trim(),
        class: klass,
        board: board,
        icon: newSubjectIcon || '📚'
    });
    if (error) {
        console.error(error);
        setError('Failed to add subject');
    } else {
        setNewSubjectName('');
        loadSubjects();
    }
    setIsUploading(false);
  };

  const renameSubject = async (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!supabase) return;
    const newName = prompt('Enter new name for ' + subject.name, subject.name);
    if (!newName || newName === subject.name) return;
    
    const { error } = await supabase.from('subjects').update({ name: newName }).eq('id', subject.id);
    if (error) {
        console.error(error);
        setError('Failed to rename subject');
    } else {
        loadSubjects();
        if (selected?.id === subject.id) {
            setSelected({ ...subject, name: newName });
        }
    }
  };

  const deleteSubject = async (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!supabase) return;
    if (!confirm('Are you sure you want to delete ' + subject.name + '? All materials will be deleted.')) return;
    
    const { error } = await supabase.from('subjects').delete().eq('id', subject.id);
    if (error) {
        console.error(error);
        setError('Failed to delete subject');
    } else {
        loadSubjects();
        if (selected?.id === subject.id) setSelected(null);
    }
  };

  const addSection = async () => {
    if (!selected || !newSectionName.trim() || !supabase) return;
    setIsUploading(true);
    const { error } = await supabase.from('sections').insert({
        subject_id: selected.id,
        name: newSectionName.trim()
    });
    if (error) {
        console.error(error);
        setError('Failed to add section');
    } else {
        setNewSectionName('');
        loadSections(selected.id);
    }
    setIsUploading(false);
  };

  const updateSection = async (id: string, newName: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('sections').update({ name: newName }).eq('id', id);
    if (error) {
        console.error(error);
        setError('Failed to rename section');
    } else {
        if (selected) loadSections(selected.id);
    }
  };

  const deleteSection = async (id: string) => {
    if (!supabase) return;
    if (!confirm('Delete this section? Materials in it will be deleted.')) return;
    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) {
        console.error(error);
        setError('Failed to delete section');
    } else {
        if (selected) loadSections(selected.id);
    }
  };

  const handleUpload = async (sectionId: string) => {
    if (!selected || !supabase) return;
    
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
    
    // Upload file
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${selected.id}/${sectionId}/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
        .from('materials')
        .upload(filePath, file);
        
    if (uploadError) {
        console.error(uploadError);
        setError('Failed to upload file');
        setIsUploading(false);
        return;
    }
    
    const { data: { publicUrl } } = supabase.storage
        .from('materials')
        .getPublicUrl(filePath);
        
    // Insert material record
    const { error: dbError } = await supabase.from('materials').insert({
        subject_id: selected.id,
        section_id: sectionId,
        title: titleVal,
        type: file.type === 'application/pdf' ? 'pdf' : 'sheet',
        url: publicUrl
    });
    
    if (dbError) {
        console.error(dbError);
        setError('Failed to save material record');
    } else {
        titleInput.value = '';
        fileInput.value = '';
        loadMaterials(selected.id);
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
    if (!editingMaterialId || !supabase) return;
    
    const { error } = await supabase.from('materials').update({ title: editingTitle }).eq('id', editingMaterialId);
    
    if (error) {
        console.error(error);
        setError('Failed to update material');
    } else {
        setEditingMaterialId(null);
        setEditingTitle('');
        if (selected) loadMaterials(selected.id);
    }
  };

  const deleteMaterial = async (id: string) => {
    if (!supabase) return;
    if (!confirm('Delete this material?')) return;
    
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) {
        console.error(error);
        setError('Failed to delete material');
    } else {
        if (selected) loadMaterials(selected.id);
    }
  };

  const [showSidebar, setShowSidebar] = useState(!isMobile);

  useEffect(() => {
    // Auto-hide sidebar on mobile when subject is selected
    if (isMobile && selected) setShowSidebar(false);
    // Auto-show sidebar on mobile when no subject is selected
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
      
      {!supabase ? (
         <div style={{ border: `1px solid ${theme.colors.error}`, background: '#fff6ff', padding: 12, borderRadius: 8, marginTop: 12, color: theme.colors.error }}>
          Supabase is not configured. Please check your .env file in web-admin/.env.
         </div>
      ) : null}
      {error ? <div style={{ color: theme.colors.error, marginBottom: 16, padding: 12, background: '#fee2e2', borderRadius: 8 }}>{error}</div> : null}
      
      {showSqlHelp && (
        <div style={{ marginBottom: 24, padding: 20, background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: 8, color: '#856404' }}>
          {/* ... existing sql help content ... */}
          <h3 style={{ marginTop: 0 }}>⚠️ Database Setup Required</h3>
          <p>The <strong>sections</strong> table is missing. Please run the following SQL in your Supabase Dashboard &rarr; SQL Editor:</p>
          <pre style={{ background: '#f8f9fa', padding: 12, borderRadius: 4, overflowX: 'auto', fontSize: 13, border: '1px solid #dee2e6' }}>
{`-- Create Sections Table
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- RLS Policies
alter table public.sections enable row level security;
create policy "Public sections are viewable by everyone" on public.sections for select using (true);
create policy "Users can insert sections" on public.sections for insert with check (true);
create policy "Users can update sections" on public.sections for update using (true);
create policy "Users can delete sections" on public.sections for delete using (true);

-- Update Materials Table
alter table public.materials add column if not exists section_id uuid references public.sections(id) on delete cascade;
alter table public.materials add column if not exists category text;

-- Create User Progress Table
create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  progress integer default 0,
  status text default 'started',
  last_accessed timestamptz default now(),
  unique(user_id, material_id)
);

-- Progress RLS
alter table public.user_progress enable row level security;
create policy "Users can view own progress" on public.user_progress for select using (auth.uid() = user_id);
create policy "Users can insert own progress" on public.user_progress for insert with check (auth.uid() = user_id);
create policy "Users can update own progress" on public.user_progress for update using (auth.uid() = user_id);`}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer', background: '#856404', color: 'white', border: 'none', borderRadius: 4 }}>I've run the SQL, Refresh Page</button>
        </div>
      )}

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
                                            {m.url && <a href={m.url} target="_blank" style={{ fontSize: 12, color: theme.colors.primary, textDecoration: 'none', whiteSpace: 'nowrap' }}>Open</a>}
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
