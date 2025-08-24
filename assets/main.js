const grid = document.querySelector('#projects');

const base = location.pathname.endsWith('/') 
  ? location.pathname 
  : location.pathname.replace(/[^/]+$/, '/');
fetch(`${base}projects/projects.json`)
  .then(res => res.json())
  .then(projects => {
    projects.forEach(p => grid.appendChild(card(p)));
  })
  .catch(err => {
    console.error("Erreur de chargement des projets :", err);
  });

function card(p) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = `projects/${p.folder}/`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.innerHTML = `
    <div class="thumb">
      ${p.thumbnail ? `<img src="projects/${p.folder}/${p.thumbnail}" alt="">` : '🚀'}
    </div>
    <div class="body">
      <h3>${p.title}</h3>
      <p>${p.description ?? ''}</p>
      <div class="tags">${(p.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
      <div class="meta"><span>${p.date ?? ''}</span><span>Ouvrir →</span></div>
    </div>`;
  return a;
}