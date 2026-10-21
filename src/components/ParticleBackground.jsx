import React from 'react';
import { useReducedMotion } from '../hooks/useScrollAnimations.ts';

export function ParticleBackground(props) {
  var prefersReducedMotion = useReducedMotion();
  var canvasRef = React.useRef(null);
  var animationRef = React.useRef(null);
  var particlesRef = React.useRef([]);

  React.useEffect(function() {
    if (prefersReducedMotion) return;

    var canvas = canvasRef.current;
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var colors = ['var(--va-accent)', 'var(--va-downstream)', 'var(--va-warn)'];

    var initParticles = function() {
      var newParticles = [];
      for (var i = 0; i < 25; i++) {
        newParticles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * (6 - 2) + 2,
          speedX: (Math.random() - 0.5) * 0.5,
          speedY: -Math.random() * 1.5 - 0.5,
          opacity: Math.random() * 0.15 * 0.5 + 0.15 * 0.5,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 1000,
        });
      }
      return newParticles;
    };

    var resize = function() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    particlesRef.current = initParticles();

    var animate = function() {
      if (!ctx) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach(function(particle) {
        particle.y += particle.speedY;
        particle.x += particle.speedX;

        if (particle.y < -particle.size) {
          particle.y = canvas.height + particle.size;
          particle.x = Math.random() * canvas.width;
        }

        if (particle.x < -particle.size) particle.x = canvas.width + particle.size;
        if (particle.x > canvas.width + particle.size) particle.x = -particle.size;

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return function() {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  return React.createElement('canvas', {
    ref: canvasRef,
    className: 'va-particles-canvas ' + (props.className || ''),
    style: {
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: -1,
      ...props.style,
    },
    'aria-hidden': 'true',
  });
}

export default ParticleBackground;