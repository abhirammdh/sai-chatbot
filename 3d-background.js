// Import Three.js library
import * as THREE from "three"

// 3D Background Animation Controller
class ThreeJSBackground {
  constructor() {
    this.scene = null
    this.camera = null
    this.renderer = null
    this.particles = []
    this.geometries = []
    this.scrollY = 0
    this.targetScrollY = 0
    this.time = 0

    this.init()
    this.createParticles()
    this.createFloatingGeometries()
    this.setupEventListeners()
    this.animate()
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene()

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    this.camera.position.z = 5

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById("bg-canvas"),
      alpha: true,
      antialias: true,
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(1, 1, 1)
    this.scene.add(directionalLight)

    const pointLight = new THREE.PointLight(0x667eea, 1, 100)
    pointLight.position.set(10, 10, 10)
    this.scene.add(pointLight)
  }

  createParticles() {
    const particleCount = 1000
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)

    const colorPalette = [
      new THREE.Color(0x667eea),
      new THREE.Color(0x764ba2),
      new THREE.Color(0xf093fb),
      new THREE.Color(0xf5576c),
      new THREE.Color(0x4facfe),
      new THREE.Color(0x00f2fe),
    ]

    for (let i = 0; i < particleCount; i++) {
      // Positions
      positions[i * 3] = (Math.random() - 0.5) * 50
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50

      // Colors
      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)]
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b

      // Sizes
      sizes[i] = Math.random() * 3 + 1
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float time;
        
        void main() {
          vColor = color;
          vec3 pos = position;
          
          // Wave motion
          pos.x += sin(time * 0.5 + position.y * 0.01) * 2.0;
          pos.y += cos(time * 0.3 + position.x * 0.01) * 1.5;
          pos.z += sin(time * 0.4 + position.x * 0.01 + position.y * 0.01) * 1.0;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        
        void main() {
          float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
          float alpha = 1.0 - smoothstep(0.0, 0.5, distanceToCenter);
          gl_FragColor = vec4(vColor, alpha * 0.8);
        }
      `,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    })

    this.particles = new THREE.Points(geometry, material)
    this.scene.add(this.particles)
  }

  createFloatingGeometries() {
    const geometryTypes = [
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.OctahedronGeometry(1),
      new THREE.TetrahedronGeometry(1),
      new THREE.DodecahedronGeometry(1),
      new THREE.TorusGeometry(0.8, 0.3, 8, 16),
      new THREE.TorusKnotGeometry(0.6, 0.2, 64, 8),
    ]

    for (let i = 0; i < 15; i++) {
      const geometry = geometryTypes[Math.floor(Math.random() * geometryTypes.length)]

      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.6),
        transparent: true,
        opacity: 0.3,
        wireframe: Math.random() > 0.5,
      })

      const mesh = new THREE.Mesh(geometry, material)

      mesh.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20)

      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)

      mesh.scale.setScalar(Math.random() * 2 + 0.5)

      // Store initial position and rotation for animation
      mesh.userData = {
        initialPosition: mesh.position.clone(),
        initialRotation: mesh.rotation.clone(),
        rotationSpeed: {
          x: (Math.random() - 0.5) * 0.02,
          y: (Math.random() - 0.5) * 0.02,
          z: (Math.random() - 0.5) * 0.02,
        },
        floatSpeed: Math.random() * 0.01 + 0.005,
        floatRange: Math.random() * 3 + 1,
      }

      this.geometries.push(mesh)
      this.scene.add(mesh)
    }
  }

  setupEventListeners() {
    // Scroll event
    window.addEventListener("scroll", () => {
      this.targetScrollY = window.scrollY
    })

    // Resize event
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })

    // Mouse move event for interactive effects
    window.addEventListener("mousemove", (event) => {
      const mouseX = (event.clientX / window.innerWidth) * 2 - 1
      const mouseY = -(event.clientY / window.innerHeight) * 2 + 1

      // Subtle camera movement based on mouse position
      this.camera.position.x += (mouseX * 0.5 - this.camera.position.x) * 0.05
      this.camera.position.y += (mouseY * 0.5 - this.camera.position.y) * 0.05
    })
  }

  animate() {
    requestAnimationFrame(() => this.animate())

    this.time += 0.01

    // Smooth scroll interpolation
    this.scrollY += (this.targetScrollY - this.scrollY) * 0.1

    // Update particles
    if (this.particles && this.particles.material.uniforms) {
      this.particles.material.uniforms.time.value = this.time

      // Rotate particles based on scroll
      this.particles.rotation.y = this.scrollY * 0.0005
      this.particles.rotation.x = this.scrollY * 0.0003
    }

    // Update floating geometries
    this.geometries.forEach((mesh, index) => {
      const userData = mesh.userData

      // Rotation animation
      mesh.rotation.x += userData.rotationSpeed.x
      mesh.rotation.y += userData.rotationSpeed.y
      mesh.rotation.z += userData.rotationSpeed.z

      // Floating animation
      const floatOffset = Math.sin(this.time * userData.floatSpeed + index) * userData.floatRange
      mesh.position.y = userData.initialPosition.y + floatOffset

      // Scroll-based movement
      mesh.position.z = userData.initialPosition.z + this.scrollY * 0.01

      // Pulsing scale effect
      const scale = 1 + Math.sin(this.time * 2 + index) * 0.1
      mesh.scale.setScalar(scale)

      // Color shifting
      if (mesh.material.color) {
        const hue = (this.time * 0.1 + index * 0.1) % 1
        mesh.material.color.setHSL(hue, 0.7, 0.6)
      }
    })

    // Camera movement based on scroll
    this.camera.position.z = 5 + this.scrollY * 0.01
    this.camera.rotation.z = this.scrollY * 0.0001

    // Render the scene
    this.renderer.render(this.scene, this.camera)
  }

  // Method to add interactive elements
  addInteractiveElement(position, color = 0x667eea) {
    const geometry = new THREE.SphereGeometry(0.5, 32, 32)
    const material = new THREE.MeshPhongMaterial({
      color: color,
      transparent: true,
      opacity: 0.7,
      emissive: color,
      emissiveIntensity: 0.2,
    })

    const sphere = new THREE.Mesh(geometry, material)
    sphere.position.copy(position)

    // Add pulsing animation
    sphere.userData = {
      pulseSpeed: 0.05,
      pulseRange: 0.3,
    }

    this.scene.add(sphere)

    // Animate the sphere
    const animateSphere = () => {
      const scale = 1 + Math.sin(this.time * sphere.userData.pulseSpeed) * sphere.userData.pulseRange
      sphere.scale.setScalar(scale)

      requestAnimationFrame(animateSphere)
    }
    animateSphere()

    return sphere
  }
}

// Particle System for UI Enhancement
class ParticleSystem {
  constructor() {
    this.particles = []
    this.container = null
    this.init()
  }

  init() {
    this.container = document.createElement("div")
    this.container.className = "particle-overlay"
    document.body.appendChild(this.container)

    this.createParticles()
  }

  createParticles() {
    for (let i = 0; i < 50; i++) {
      this.createParticle()
    }
  }

  createParticle() {
    const particle = document.createElement("div")
    particle.className = "particle"

    // Random starting position
    particle.style.left = Math.random() * 100 + "%"
    particle.style.animationDelay = Math.random() * 8 + "s"
    particle.style.animationDuration = Math.random() * 4 + 4 + "s"

    // Random size and opacity
    const size = Math.random() * 4 + 2
    particle.style.width = size + "px"
    particle.style.height = size + "px"
    particle.style.opacity = Math.random() * 0.5 + 0.3

    this.container.appendChild(particle)
    this.particles.push(particle)

    // Remove and recreate particle after animation
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle)
        this.createParticle()
      }
    }, 8000)
  }
}

// Scroll-based reveal animations
class ScrollAnimations {
  constructor() {
    this.elements = []
    this.init()
  }

  init() {
    // Add scroll-reveal class to elements
    const elementsToAnimate = document.querySelectorAll(
      ".config-panel, .advanced-panel, .analytics-panel, .stat-card, .tool-card",
    )

    elementsToAnimate.forEach((element) => {
      element.classList.add("scroll-reveal")
      this.elements.push(element)
    })

    this.setupIntersectionObserver()
  }

  setupIntersectionObserver() {
    const options = {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed")
        }
      })
    }, options)

    this.elements.forEach((element) => {
      observer.observe(element)
    })
  }
}

// Initialize all 3D and animation systems
document.addEventListener("DOMContentLoaded", () => {
  // Wait a bit for the DOM to be fully ready
  setTimeout(() => {
    new ThreeJSBackground()
    new ParticleSystem()
    new ScrollAnimations()
  }, 100)
})
