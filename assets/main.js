import projects from '../projects/projects.json' assert { type: 'json' };

const grid = document.querySelector('#projects');

function card(p){
  const a = document.createElement('a');
  a.className = 'card';
  a.href = `projects/${p.folder}/`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.innerHTML = `
    <div class="thumb">${p.thumbnail ? `<img src="projects/${p.folder}/${p.thumbnail}" alt="">` : '🚀'}</div>
    <div class="body">
      <h3>${p.title}</h3>
      <p>${p.description ?? ''}</p>
      <div class="tags">${(p.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')}</div>
      <div class="meta"><span>${p.date ?? ''}</span><span>Ouvrir →</span></div>
    </div>`;
  return a;
}

projects.forEach(p => grid.appendChild(card(p)));
