

(function() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  const particles = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  for (let i = 0; i < 100; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      r: Math.random() * 2.5 + 0.5,
      c: Math.random() > 0.5 ? 'rgba(251, 191, 36, ' : 'rgba(45, 212, 191, ',
      a: Math.random() * 0.6 + 0.2
    });
  }

  let mouseX = w/2, mouseY = h/2;
  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  const items = document.querySelectorAll('.food-item');
  const speeds = Array.from(items).map((_, i) => 0.02 + (i % 3) * 0.03);

  function draw() {
    ctx.clearRect(0, 0, w, h);


    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const dist = Math.sqrt(dx*dx + dy*dy);


      if (dist > 0 && dist < 180) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(mouseX, mouseY);
        ctx.strokeStyle = p.c + (0.5 - dist/360) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();


        p.x += (dx / dist) * 1.5;
        p.y += (dy / dist) * 1.5;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c + p.a + ')';
      ctx.fill();
    });


    const cx = w/2, cy = h/2;
    items.forEach((item, i) => {
      const speed = speeds[i];
      const tx = (cx - mouseX) * speed;
      const ty = (cy - mouseY) * speed;
      item.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    });

    requestAnimationFrame(draw);
  }
  draw();
})();
