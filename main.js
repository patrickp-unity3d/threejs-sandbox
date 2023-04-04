import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { GroundProjectedSkybox } from "three/addons/objects/GroundProjectedSkybox.js";

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

const param = { TAAEnabled: '1', TAASampleLevel: 5 };

let renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setAnimationLoop(render);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 4;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

let scene = new THREE.Scene();

let camera = new THREE.PerspectiveCamera(23, window.innerWidth / window.innerHeight, 0.25, 200);
camera.position.set(6, 2, 10);

// taa
let composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType }));

let taaRenderPass = new TAARenderPass(scene, camera);
taaRenderPass.unbiased = false;
composer.addPass(taaRenderPass);

let renderPass = new RenderPass(scene, camera);
renderPass.enabled = false;
composer.addPass(renderPass);

let copyPass = new ShaderPass(CopyShader);
composer.addPass(copyPass);

window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);
});

// shadow plane
const geometry = new THREE.PlaneGeometry(20, 20);
geometry.rotateX(-Math.PI / 2);

const material = new THREE.ShadowMaterial();
material.opacity = 0.6;

const plane = new THREE.Mesh(geometry, material);
plane.position.y = 0.01;
plane.receiveShadow = true;
scene.add(plane);

// controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();

new RGBELoader().setPath('assets/').load('construction_2k.hdr', function (texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;

    scene.background = texture;
    scene.environment = texture;

    // create low res
    let ground = new GroundProjectedSkybox(texture);
    ground.scale.setScalar(100);
    ground.height = 5;
    scene.add(ground);

    render();

    new RGBELoader().setPath('assets/').loadAsync('construction_8k.hdr', progress => {
        render();
    }).then(texture => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;

        // remove low res
        scene.remove(ground);

        ground = new GroundProjectedSkybox(texture);
        ground.scale.setScalar(100);
        ground.height = 5;
        scene.add(ground);

        render();
    });

    // yard
    new GLTFLoader().setPath('assets/').loadAsync('construction.glb').then(gltf => {
        scene.add(gltf.scene);
        gltf.scene.getObjectByName('CircularFloor').visible = false;

        // shadow only
        let sun = gltf.scene.getObjectByName('Sun_Light');
        sun.castShadow = true;
        sun.intensity = 0.01;

        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;

        sun.target = plane;
        sun.position.set(1, 0.5, -0.25);

        render();
    });

    // model
    new GLTFLoader().setPath('assets/').loadAsync('skidLoader.glb').then(gltf => {
        gltf.scene.rotation.set(0, THREE.MathUtils.degToRad(90), 0);

        let box = new THREE.Box3().setFromObject(gltf.scene);
        let sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        controls.target.set(sphere.center.x, sphere.center.y, sphere.center.z);
        controls.update();

        gltf.scene.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.material.envMapIntensity = 1.5;
                // reflection debugging only
                /*child.material.metalness = 0.5;
                child.material.roughness = 0;*/
            }
        });

        scene.add(gltf.scene);

        gltf.scene.getObjectByName('Spot_Light_Left').visible = false;
        gltf.scene.getObjectByName('Spot_Light_Right').visible = false;

        gltf.scene.getObjectByName('Wheels_Assembly-1').traverse(child => {
            child.visible = false;
        });
        gltf.scene.getObjectByName('Brush_Cutter_Assembly-1').traverse(child => {
            child.visible = false;
        });
        gltf.scene.getObjectByName('Sweeper_Assembly-1').traverse(child => {
            child.visible = false;
        });
        gltf.scene.getObjectByName('Bucket_Assembly-1').traverse(child => {
            child.visible = false;
        });

        render();
    });
});

function render() {
    taaRenderPass.enabled = (param.TAAEnabled === '1');
    renderPass.enabled = (param.TAAEnabled !== '1');
    taaRenderPass.sampleLevel = param.TAASampleLevel;
    taaRenderPass.accumulate = false;

    composer.render();
}
