import { useEffect, useState } from 'react';
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
  const [isUploading, setIsUploading] = useState(false);

  const navigate = useNavigate();
  const user = getUser();

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
    }
  }, [user]);

  const loadSubjects = async () => {
    setError('');
    if (!supabase) {
      setError('Supabase not configured in .env');
      return;
    }
    let { data, error } = await supabase.from('subjects').select('*').ilike('class', klass).ilike('board', board);
    
    if (error) {
      setError(error.message);
    } else {
      setSubjects(data || []);
    }
  };

  useEffect(() => {
    setSelected(null);
    setSections([]);
    setMaterials([]);
    setNewSectionName('');
    setError('');
    setEditingMaterialId(null);
    setEditingTitle('');
    loadSubjects();
  }, [klass, board]);

  useEffect(() => {
    // Reset form states whenever selected subject changes
    setNewSectionName('');
    setEditingMaterialId(null);
    setEditingTitle('');
    setError('');
    // Clear lists while loading new content
    setSections([]);
    setMaterials([]);

    if (!selected || !supabase) return;
    
    // Fetch materials
    supabase.from('materials').select('*').eq('subject_id', selected.id).then(({ data, error }) => {
      if (error) setError(error.message);
      else setMaterials(data || []);
    });

    // Fetch sections
    supabase.from('sections').select('*').eq('subject_id', selected.id).order('created_at').then(({ data, error }) => {
      if (error) {
        console.error('Error fetching sections:', error.message);
        if (error.code === 'PGRST205' || error.message.includes('not found') || error.message.includes('404')) {
           setShowSqlHelp(true);
        }
      } else {
        setSections(data || []);
        setShowSqlHelp(false);
      }
    });
  }, [selected]);

  const addSubject = async () => {
    if (!supabase || !newSubjectName) return;
    
    setIsUploading(true);
    try {
      // Check for duplicates
      const { data: existing } = await supabase
        .from('subjects')
        .select('id')
        .ilike('name', newSubjectName.trim())
        .eq('class', klass)
        .eq('board', board)
        .single();

      if (existing) {
        setError(`Subject "${newSubjectName}" already exists for ${klass} ${board}`);
        return;
      }

      let { data, error } = await supabase.from('subjects').insert({ name: newSubjectName.trim(), icon: newSubjectIcon, class: klass, board }).select().single();
      if (error) {
        setError(error.message);
        return;
      }
      setSubjects(prev => [...prev, data as any]);
      setNewSubjectName('');
      setNewSubjectIcon('');
      setError('');
    } finally {
       setIsUploading(false);
    }
  };

  const deleteSubject = async (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!supabase) return;

    // Check for dependencies
    const { count: sectionCount } = await supabase
      .from('sections')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subject.id);

    const { count: materialCount } = await supabase
      .from('materials')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subject.id);

    const hasDeps = (sectionCount || 0) > 0 || (materialCount || 0) > 0;
    
    let message = `Are you sure you want to delete "${subject.name}"?`;
    if (hasDeps) {
      message += `\n\nWARNING: This subject has ${sectionCount} groups and ${materialCount} materials.\nDeleting it will PERMANENTLY REMOVE all associated content.`;
    }

    if (!confirm(message)) return;

    const { error } = await supabase.from('subjects').delete().eq('id', subject.id);
    if (error) {
      setError(error.message);
    } else {
      setSubjects(prev => prev.filter(s => s.id !== subject.id));
      if (selected?.id === subject.id) setSelected(null);
    }
  };

  const renameSubject = async (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!supabase) return;

    const newName = prompt('Enter new subject name:', subject.name);
    if (!newName || newName.trim() === subject.name) return;

    const trimmedName = newName.trim();

    // Check for duplicates
    const { data: existing } = await supabase
      .from('subjects')
      .select('id')
      .ilike('name', trimmedName)
      .eq('class', subject.class)
      .eq('board', subject.board)
      .neq('id', subject.id) // Exclude self
      .single();

    if (existing) {
      alert(`Subject "${trimmedName}" already exists for this class and board.`);
      return;
    }

    const { error } = await supabase.from('subjects').update({ name: trimmedName }).eq('id', subject.id);
    if (error) {
      setError(error.message);
    } else {
      setSubjects(prev => prev.map(s => s.id === subject.id ? { ...s, name: trimmedName } : s));
      if (selected?.id === subject.id) setSelected(prev => prev ? { ...prev, name: trimmedName } : null);
    }
  };

  const addSection = async () => {
    if (!supabase || !selected || !newSectionName.trim()) return;
    setIsUploading(true);
    try {
      const { data, error } = await supabase.from('sections').insert({ subject_id: selected.id, name: newSectionName.trim() }).select().single();
      if (error) {
        setError(error.message);
        return;
      }
      setSections(prev => [...prev, data as any]);
      setNewSectionName('');
      setError('');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteSection = async (id: string) => {
    if (!supabase || !confirm('Delete this section and all its materials?')) return;
    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) setError(error.message);
    else setSections(prev => prev.filter(s => s.id !== id));
  };

  const updateSection = async (id: string, newName: string) => {
      if (!supabase) return;
      const { error } = await supabase.from('sections').update({ name: newName }).eq('id', id);
      if (error) setError(error.message);
      else setSections(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
  };

  const handleUpload = async (sectionId: string) => {
    if (!supabase || !selected) return;
    
    // Get title and file from inputs
    const titleInput = document.getElementById(`title-${sectionId}`) as HTMLInputElement;
    const fileInput = document.getElementById(`file-${sectionId}`) as HTMLInputElement;
    
    const title = titleInput?.value;
    const file = fileInput?.files?.[0];

    if (!title) {
      setError('Please enter a title for the material first.');
      return;
    }
    
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    try {
      const path = `${selected.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('materials').upload(path, file, { upsert: true, contentType: file.type });
      if (error) {
        setError(error.message);
        return;
      }
      const { data: pub } = supabase.storage.from('materials').getPublicUrl(path);
      
      const { data, error: insErr } = await supabase.from('materials').insert({ 
        subject_id: selected.id, 
        section_id: sectionId,
        title: title, 
        type: 'pdf', 
        url: pub.publicUrl,
        category: '' // Deprecated
      }).select().single();

      if (insErr) {
        setError(insErr.message);
        return;
      }
      setMaterials(prev => [...prev, data as any]);
      
      // Clear inputs
      titleInput.value = '';
      fileInput.value = '';
      setError('');
    } catch (err: any) {
        setError(err.message || 'Upload failed');
    } finally {
        setIsUploading(false);
    }
  };

  const startEditing = (m: Material) => {
    setEditingMaterialId(m.id);
    setEditingTitle(m.title);
  };

  const saveEdit = async () => {
    if (!supabase || !editingMaterialId || !editingTitle.trim()) return;
    
    const { error } = await supabase.from('materials').update({ title: editingTitle.trim() }).eq('id', editingMaterialId);
    
    if (error) {
      setError(error.message);
    } else {
      setMaterials(prev => prev.map(m => m.id === editingMaterialId ? { ...m, title: editingTitle.trim() } : m));
      setEditingMaterialId(null);
      setEditingTitle('');
    }
  };

  const cancelEdit = () => {
    setEditingMaterialId(null);
    setEditingTitle('');
  };

  const deleteMaterial = async (id: string) => {
    if (!supabase) return;
    if (!confirm('Are you sure you want to delete this material?')) return;
    
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) {
      setError(error.message);
    } else {
      setMaterials(prev => prev.filter(m => m.id !== id));
    }
  };

  const logout = () => {
    signOut();
    navigate('/', { replace: true });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ margin: 0, color: theme.colors.primary }}>StudyHub Admin</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={logout} style={{ ...styles.button, ...styles.secondaryButton }}>Logout</button>
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

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
        <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${theme.colors.border}`, background: '#f8f9fa' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 18 }}>Subjects</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
                onClick={() => setSelected(s)}
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
        
        <div style={styles.card}>
          <div style={{ marginBottom: 24, borderBottom: `1px solid ${theme.colors.border}`, paddingBottom: 16 }}>
             <h3 style={{ margin: 0, fontSize: 24 }}>{selected ? selected.name : 'Select a Subject'}</h3>
             {selected && <p style={{ margin: '4px 0 0 0', color: theme.colors.textSecondary }}>Manage study materials and sections</p>}
          </div>

          {selected ? (
            <>
              {/* Add New Section/Group */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24, padding: 20, background: '#f8f9fa', borderRadius: theme.borderRadius, alignItems: 'center' }}>
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
                 <div style={{ alignSelf: 'flex-end' }}>
                    <button onClick={addSection} style={{ ...styles.button, ...styles.primaryButton }} disabled={isUploading}>
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
                       <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', background: '#f8f9fa', padding: 16, borderRadius: theme.borderRadius }}>
                          <div style={{ flex: 1 }}>
                            <input id={`title-${section.id}`} placeholder="Material Title (Required)" style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <input type="file" id={`file-${section.id}`} disabled={isUploading} style={{ fontSize: 14 }} />
                          </div>
                          <button onClick={() => handleUpload(section.id)} style={{ ...styles.button, ...styles.primaryButton, padding: '8px 16px' }} disabled={isUploading}>
                            {isUploading ? 'Uploading...' : 'Add Material'}
                          </button>
                       </div>

                       {/* Materials List */}
                       <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {materials.filter(m => m.section_id === section.id).map(m => (
                             <li key={m.id} style={{ padding: '12px 0', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {editingMaterialId === m.id ? (
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                                    <input 
                                      value={editingTitle} 
                                      onChange={e => setEditingTitle(e.target.value)} 
                                      style={{ ...styles.input, flex: 1 }} 
                                    />
                                    <button onClick={saveEdit} style={{ ...styles.button, ...styles.primaryButton, padding: '6px 12px', fontSize: 12 }}>Save</button>
                                    <button onClick={cancelEdit} style={{ ...styles.button, ...styles.secondaryButton, padding: '6px 12px', fontSize: 12, color: theme.colors.textSecondary, borderColor: theme.colors.border }}>Cancel</button>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ background: '#e9ecef', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: theme.colors.textSecondary }}>{m.type.toUpperCase()}</span>
                                        <span style={{ fontWeight: 500 }}>{m.title}</span>
                                        {m.url && <a href={m.url} target="_blank" style={{ fontSize: 12, color: theme.colors.primary, textDecoration: 'none' }}>Open</a>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
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

                {/* Uncategorized Materials (Legacy Support) */}
                {materials.some(m => !m.section_id) && (
                   <div style={{ border: '1px solid #ffecb3', borderRadius: theme.borderRadius, overflow: 'hidden' }}>
                      <div style={{ background: '#fff3cd', padding: '12px 20px' }}>
                         <h4 style={{ margin: 0, color: '#856404' }}>Uncategorized / Legacy Items</h4>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 20, margin: 0 }}>
                         {materials.filter(m => !m.section_id).map(m => (
                             <li key={m.id} style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                                <span><span style={{ fontWeight: 600 }}>[{m.category || 'General'}]</span> {m.title}</span>
                                <button onClick={() => deleteMaterial(m.id)} style={{ color: theme.colors.error, background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
                             </li>
                          ))}
                      </ul>
                   </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, color: theme.colors.textSecondary }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
                <p>Select a subject from the sidebar to manage content.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
