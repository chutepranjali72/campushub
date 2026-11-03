import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from './api.js';

const emptyStudent = { studentId: '', name: '', email: '', department: '', section: '', semester: '', contact: '' };
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'ST';
const hue = (text = '') => [...text].reduce((a, c) => a + c.charCodeAt(0), 0) % 5;

function App() {
  const [page, setPage] = useState('overview');
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([request('/api/students'), request('/api/departments')]);
      setStudents(s.data);
      setDepartments(d.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) setDrawer(null);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPage('students');
        requestAnimationFrame(() => document.getElementById('student-search')?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving]);

  const countByDept = useMemo(() => {
    const map = {};
    students.forEach((s) => { const id = s.department?._id; if (id) map[id] = (map[id] || 0) + 1; });
    return map;
  }, [students]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (deptFilter && s.department?._id !== deptFilter) return false;
      if (!q) return true;
      return [s.studentId, s.name, s.email, s.department?.name, s.section].join(' ').toLowerCase().includes(q);
    });
  }, [students, query, deptFilter]);

  const openStudent = (student = null) => setDrawer({
    type: 'student', student,
    values: student ? {
      studentId: student.studentId, name: student.name, email: student.email,
      department: student.department?._id || '', section: student.section,
      semester: String(student.semester), contact: student.contact || ''
    } : { ...emptyStudent, department: deptFilter || departments[0]?._id || '' },
    formError: ''
  });

  const openDepartment = (department = null) => setDrawer({
    type: 'department', department,
    values: { name: department?.name || '', sections: department ? department.sections.join(', ') : '' },
    formError: ''
  });

  const setField = (key, value, extra = {}) =>
    setDrawer((d) => ({ ...d, values: { ...d.values, [key]: value, ...extra } }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { type, student, department, values } = drawer;
      if (type === 'student') {
        const path = student ? `/api/students/${encodeURIComponent(student.studentId)}` : '/api/students';
        await request(path, { method: student ? 'PUT' : 'POST', body: JSON.stringify({ ...values, semester: Number(values.semester) }) });
        setNotice(student ? 'Student updated' : 'Student added');
      } else {
        const sections = [...new Set(values.sections.split(',').map((s) => s.trim()).filter(Boolean))];
        await request(department ? `/api/departments/${department._id}` : '/api/departments', {
          method: department ? 'PUT' : 'POST', body: JSON.stringify({ name: values.name, sections })
        });
        setNotice(department ? 'Department updated' : 'Department created');
      }
      setDrawer(null);
      await loadData();
    } catch (e) {
      setDrawer((d) => ({ ...d, formError: e.message }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind, item) => {
    const label = kind === 'student' ? `${item.name} (${item.studentId})` : item.name;
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    try {
      const path = kind === 'student' ? `/api/students/${encodeURIComponent(item.studentId)}` : `/api/departments/${item._id}`;
      await request(path, { method: 'DELETE' });
      setNotice(`${item.name} deleted`);
      await loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const sectionsTotal = departments.reduce((n, d) => n + d.sections.length, 0);
  const semesters = new Set(students.map((s) => s.semester)).size;
  const maxCount = Math.max(1, ...Object.values(countByDept));
  const drawerSections = departments.find((d) => d._id === drawer?.values?.department)?.sections || [];
  const nav = [['overview', 'Overview'], ['students', 'Students'], ['departments', 'Departments']];

  return (
    <div className="shell">
      <header className="nav">
        <button className="logo" onClick={() => setPage('overview')} aria-label="Go to overview">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0e7c86" /><path d="M7 20 16 9l9 11M11 18v6h10v-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>CampusDesk</span>
        </button>
        <nav className="tabs" aria-label="Main">
          {nav.map(([key, label]) => (
            <button key={key} className={page === key ? 'on' : ''} aria-current={page === key ? 'page' : undefined}
              onClick={() => { if (key === 'students') { setDeptFilter(''); setQuery(''); } setPage(key); }}>
              {label}
            </button>
          ))}
        </nav>
        <button className="btn btn-solid" onClick={() => openStudent()} disabled={!departments.length}>New student</button>
      </header>

      <main className="page">
        {loading && <div className="progress" />}
        {error && <div className="banner bad" role="alert"><p><b>That didn’t work.</b> {error}</p><button onClick={() => setError('')}>Dismiss</button></div>}

        {page === 'overview' && (<>
          <section className="hero">
            <div>
              <h1>Student records, all in one place</h1>
              <p>{students.length ? `${students.length} students enrolled across ${departments.length} departments.` : 'Start by creating a department, then enrol your first student.'}</p>
            </div>
            <dl className="figures">
              <div><dt>Students</dt><dd>{students.length}</dd></div>
              <div><dt>Departments</dt><dd>{departments.length}</dd></div>
              <div><dt>Sections</dt><dd>{sectionsTotal}</dd></div>
              <div><dt>Semesters</dt><dd>{semesters}</dd></div>
            </dl>
          </section>

          <div className="split">
            <section className="block">
              <div className="block-head"><h2>Latest enrolments</h2><button className="link" onClick={() => setPage('students')}>See all students</button></div>
              {students.length ? <ul className="feed">{students.slice(0, 6).map((s) => (
                <li key={s._id}><span className={`dot h${hue(s.name)}`}>{initials(s.name)}</span>
                  <div><b>{s.name}</b><small>{s.department?.name || 'No department'}{s.section ? `, section ${s.section}` : ''}</small></div>
                  <em>Sem {s.semester}</em></li>))}</ul>
                : <Empty title="No students yet" text="Enrolled students will show up here." action="Add a student" onAction={() => openStudent()} disabled={!departments.length} />}
            </section>
            <section className="block">
              <div className="block-head"><h2>Headcount by department</h2><button className="link" onClick={() => openDepartment()}>Add department</button></div>
              {departments.length ? <ul className="bars">{departments.map((d) => (
                <li key={d._id}><div><span>{d.name}</span><b>{countByDept[d._id] || 0}</b></div>
                  <i><u style={{ width: `${((countByDept[d._id] || 0) / maxCount) * 100}%` }} /></i></li>))}</ul>
                : <Empty title="No departments" text="Departments group your students into sections." action="Create department" onAction={() => openDepartment()} />}
            </section>
          </div>
        </>)}

        {page === 'students' && (<>
          <div className="title-row"><div><h1>Students</h1><p>{visible.length} of {students.length} shown</p></div></div>
          <div className="chips" role="tablist" aria-label="Filter by department">
            <button className={!deptFilter ? 'on' : ''} onClick={() => setDeptFilter('')}>All <small>{students.length}</small></button>
            {departments.map((d) => (
              <button key={d._id} className={deptFilter === d._id ? 'on' : ''} onClick={() => setDeptFilter(d._id)}>{d.name} <small>{countByDept[d._id] || 0}</small></button>))}
          </div>
          <div className="search"><input id="student-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, ID, email or section" aria-label="Search students" /><kbd>Ctrl K</kbd></div>
          {!departments.length && <div className="banner">Create a department first, then you can enrol students. <button className="link" onClick={() => setPage('departments')}>Go to departments</button></div>}
          {visible.length ? (
            <div className="roster">
              <div className="roster-head"><span>Student</span><span>ID</span><span>Department</span><span>Section</span><span>Semester</span><span /></div>
              {visible.map((s) => (
                <div className="roster-row" key={s._id}>
                  <span className="who"><span className={`dot h${hue(s.name)}`}>{initials(s.name)}</span><span><b>{s.name}</b><small>{s.email}</small></span></span>
                  <span className="mono" data-label="ID">{s.studentId}</span>
                  <span data-label="Department">{s.department?.name || '—'}</span>
                  <span data-label="Section">{s.section || '—'}</span>
                  <span data-label="Semester">{s.semester}</span>
                  <span className="acts"><button onClick={() => openStudent(s)} aria-label={`Edit ${s.name}`}>Edit</button><button className="danger" onClick={() => remove('student', s)} aria-label={`Delete ${s.name}`}>Delete</button></span>
                </div>))}
            </div>
          ) : <Empty title={students.length ? 'No matches' : 'No students yet'} text={students.length ? 'Try another name, ID or department.' : 'Add your first student to build the roster.'} action={students.length ? undefined : 'Add a student'} onAction={() => openStudent()} disabled={!departments.length} />}
        </>)}

        {page === 'departments' && (<>
          <div className="title-row"><div><h1>Departments</h1><p>Each department has its own sections. Students are placed in one of them.</p></div>
            <button className="btn btn-solid" onClick={() => openDepartment()}>New department</button></div>
          {departments.length ? <ul className="depts">{departments.map((d) => (
            <li key={d._id}>
              <span className={`dot sq h${hue(d.name)}`}>{d.name[0]?.toUpperCase()}</span>
              <div className="dept-main"><h2>{d.name}</h2>
                <div className="sec">{d.sections.length ? d.sections.map((s) => <span key={s}>{s}</span>) : <small>No sections</small>}</div></div>
              <div className="dept-count"><b>{countByDept[d._id] || 0}</b><small>students</small></div>
              <span className="acts"><button onClick={() => openDepartment(d)}>Edit</button><button className="danger" onClick={() => remove('department', d)}>Delete</button></span>
            </li>))}</ul>
            : <Empty title="No departments yet" text="Create one and add sections like A and B." action="Create department" onAction={() => openDepartment()} />}
        </>)}
      </main>

      {notice && <div className="toast" role="status">{notice}</div>}

      {drawer && (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setDrawer(null); }}>
          <form className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onSubmit={submit}>
            <div className="drawer-head">
              <h2 id="drawer-title">{drawer.type === 'student' ? (drawer.student ? 'Edit student' : 'New student') : (drawer.department ? 'Edit department' : 'New department')}</h2>
              <button type="button" className="x" aria-label="Close" onClick={() => setDrawer(null)}>×</button>
            </div>
            <div className="drawer-body">
              {drawer.formError && <div className="banner bad" role="alert"><p>{drawer.formError}</p></div>}
              {drawer.type === 'student' ? (<>
                <label>Student ID<input required maxLength="30" disabled={Boolean(drawer.student)} value={drawer.values.studentId} placeholder="ST101" onChange={(e) => setField('studentId', e.target.value)} /></label>
                <label>Full name<input required maxLength="100" value={drawer.values.name} placeholder="Rahul Sharma" onChange={(e) => setField('name', e.target.value)} /></label>
                <label>Email<input required type="email" maxLength="254" value={drawer.values.email} placeholder="student@college.edu" onChange={(e) => setField('email', e.target.value)} /></label>
                <label>Department<select required value={drawer.values.department} onChange={(e) => setField('department', e.target.value, { section: '' })}>
                  <option value="" disabled>Choose a department</option>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
                <div className="pair">
                  <label>Section<select required={drawerSections.length > 0} disabled={!drawerSections.length} value={drawer.values.section} onChange={(e) => setField('section', e.target.value)}>
                    <option value="" disabled={drawerSections.length > 0}>{drawerSections.length ? 'Choose' : 'None needed'}</option>{drawerSections.map((s) => <option key={s}>{s}</option>)}</select></label>
                  <label>Semester<input required type="number" min="1" max="12" value={drawer.values.semester} placeholder="1 to 12" onChange={(e) => setField('semester', e.target.value)} /></label>
                </div>
                <label>Phone <small>(optional)</small><input type="tel" maxLength="20" value={drawer.values.contact} placeholder="9876543210" onChange={(e) => setField('contact', e.target.value)} /></label>
              </>) : (<>
                <label>Department name<input required maxLength="80" value={drawer.values.name} placeholder="Computer Science and Engineering" onChange={(e) => setField('name', e.target.value)} /></label>
                <label>Sections <small>(separate with commas)</small><input maxLength="500" value={drawer.values.sections} placeholder="A, B" onChange={(e) => setField('sections', e.target.value)} />
                  <span className="help">Sections that still have students can’t be removed.</span></label>
              </>)}
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn" disabled={saving} onClick={() => setDrawer(null)}>Cancel</button>
              <button type="submit" className="btn btn-solid" disabled={saving}>{saving ? 'Saving…' : drawer.student || drawer.department ? 'Save changes' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Empty({ title, text, action, onAction, disabled }) {
  return <div className="empty"><h3>{title}</h3><p>{text}</p>{action && <button className="btn" onClick={onAction} disabled={disabled}>{action}</button>}</div>;
}

export default App;
