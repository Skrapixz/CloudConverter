// --- PARTIE 1 : EFFET 3D (THREE.JS) ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050510, 0.002);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
camera.position.z = 1000;

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Génération d'une texture de nuage stylisée en JS
const canvas = document.createElement('canvas');
canvas.width = 32;
canvas.height = 32;
const context = canvas.getContext('2d');
const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
gradient.addColorStop(0, 'rgba(255,255,255,1)');
gradient.addColorStop(1, 'rgba(255,255,255,0)');
context.fillStyle = gradient;
context.fillRect(0, 0, 32, 32);
const cloudTexture = new THREE.CanvasTexture(canvas);

// Création des particules (nuages)
const cloudGeo = new THREE.BufferGeometry();
const cloudCount = 800;
const positions = new Float32Array(cloudCount * 3);
const velocities = [];

for (let i = 0; i < cloudCount; i++) {
    positions[i * 3] = Math.random() * 2000 - 1000;
    positions[i * 3 + 1] = Math.random() * 2000 - 1000;
    positions[i * 3 + 2] = Math.random() * 2000 - 1000;
    velocities.push({ y: Math.random() * 0.5 + 0.1, isFalling: false }); // Vitesse vers le haut
}

cloudGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const cloudMat = new THREE.PointsMaterial({
    color: 0x4facfe,
    size: 40,
    map: cloudTexture,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const cloudParticles = new THREE.Points(cloudGeo, cloudMat);
scene.add(cloudParticles);

// Rendre les nuages interactifs (tombent au toucher)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onPointerDown(event) {
    let clientX = event.touches ? event.touches[0].clientX : event.clientX;
    let clientY = event.touches ? event.touches[0].clientY : event.clientY;

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Simplification : on fait tomber les particules dans un rayon autour du toucher
    const pos = cloudGeo.attributes.position.array;
    for (let i = 0; i < cloudCount; i++) {
        // Pseudo-hitbox pour faire réagir une large zone
        if (Math.random() > 0.6) { 
            velocities[i].isFalling = true;
            velocities[i].y = -(Math.random() * 5 + 2); // Chute brutale
        }
    }
}

window.addEventListener('pointerdown', onPointerDown);

// Animation 3D
function animate() {
    requestAnimationFrame(animate);
    const pos = cloudGeo.attributes.position.array;
    
    for (let i = 0; i < cloudCount; i++) {
        pos[i * 3 + 1] += velocities[i].y;
        
        // Reset si le nuage sort de l'écran (en haut ou en bas)
        if (pos[i * 3 + 1] > 1000) {
            pos[i * 3 + 1] = -1000;
        } else if (pos[i * 3 + 1] < -1000 && velocities[i].isFalling) {
            pos[i * 3 + 1] = -1000;
            velocities[i].isFalling = false;
            velocities[i].y = Math.random() * 0.5 + 0.1; // Remonte doucement
        }
    }
    
    cloudGeo.attributes.position.needsUpdate = true;
    cloudParticles.rotation.y += 0.001; // Rotation douce globale
    renderer.render(scene, camera);
}
animate();

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- PARTIE 2 : LOGIQUE DE CONVERSION (FFMPEG) ---
const { FFmpeg } = window.FFmpeg;
const { fetchFile } = window.FFmpegUtil;
const ffmpeg = new FFmpeg();

const videoInput = document.getElementById('videoInput');
const coverInput = document.getElementById('coverInput');
const metaTitle = document.getElementById('metaTitle');
const metaArtist = document.getElementById('metaArtist');
const convertBtn = document.getElementById('convertBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const downloadContainer = document.getElementById('downloadContainer');
const downloadLink = document.getElementById('downloadLink');

ffmpeg.on('progress', ({ progress }) => {
    const percent = Math.round(progress * 100);
    progressBar.style.width = `${percent}%`;
    statusText.innerText = `Conversion en cours... ${percent}%`;
});

convertBtn.addEventListener('click', async () => {
    if (!videoInput.files.length) {
        alert("Veuillez sélectionner une vidéo !");
        return;
    }

    const videoFile = videoInput.files[0];
    const coverFile = coverInput.files.length ? coverInput.files[0] : null;
    
    convertBtn.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    downloadContainer.classList.add('hidden');
    progressBar.style.width = '0%';
    statusText.innerText = "Chargement du moteur CloudConverter...";

    try {
        if (!ffmpeg.loaded) {
            await ffmpeg.load();
        }

        statusText.innerText = "Lecture du fichier...";
        await ffmpeg.writeFile('input_video.mp4', await fetchFile(videoFile));

        let command = ['-i', 'input_video.mp4'];

        // Si une pochette est fournie, on l'intègre
        if (coverFile) {
            await ffmpeg.writeFile('cover.jpg', await fetchFile(coverFile));
            command.push('-i', 'cover.jpg', '-map', '0:a', '-map', '1', '-c:v', 'copy');
        } else {
            command.push('-vn'); // Pas de vidéo si pas de cover
        }

        // Configuration pour sortie WAV
        command.push('-c:a', 'pcm_s16le');

        // Ajout des métadonnées (-write_id3v2 1 est requis pour forcer les tags dans un .wav)
        command.push('-write_id3v2', '1');
        if (metaTitle.value) command.push('-metadata', `title=${metaTitle.value}`);
        if (metaArtist.value) command.push('-metadata', `artist=${metaArtist.value}`);

        command.push('output.wav');

        statusText.innerText = "Transformation en cours...";
        await ffmpeg.exec(command);

        statusText.innerText = "Finalisation...";
        const data = await ffmpeg.readFile('output.wav');
        
        const blob = new Blob([data.buffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        
        downloadLink.href = url;
        let finalName = metaTitle.value ? `${metaTitle.value}.wav` : 'CloudConverter_Output.wav';
        downloadLink.download = finalName;

        progressContainer.classList.add('hidden');
        downloadContainer.classList.remove('hidden');
        convertBtn.innerText = "Convertir une autre vidéo";
        convertBtn.classList.remove('hidden');

    } catch (error) {
        console.error(error);
        statusText.innerText = "Une erreur est survenue !";
        convertBtn.classList.remove('hidden');
    }
});
