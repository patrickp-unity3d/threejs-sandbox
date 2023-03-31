import * as THREE from 'three';

import WebGPU from 'three/addons/capabilities/WebGPU.js';
import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';

import { Sky } from 'three/addons/objects/Sky.js';

let useOrbitControls = true;
let useWebGPU = WebGPU.isAvailable();

// renderer
let renderer;
if (useWebGPU) {
    renderer = new WebGPURenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);
}
else {
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.2;

// staging
const scene = new THREE.Scene();

let uniforms;
if (!useWebGPU) {
    let sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = 10;
    uniforms['rayleigh'].value = 3;
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.7;
}

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const light = new THREE.DirectionalLight(0xffffff, 5);
scene.add(light)
scene.background = new THREE.Color(0x606060);

// glTF
const loader = new GLTFLoader();
let variants;
let index = 0;
let parser;
let variantsExtension;

loader.load('public/ContainerModelExported.glb', loadComplete, undefined, 
    function() {
        loader.load('ContainerModelExported.glb', loadComplete, undefined, undefined)
    });

function loadComplete (gltf) {
    scene.add(gltf.scene);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());

    gltf.scene.position.set(-center.x, -center.y, -center.z);

    parser = gltf.parser;
    variantsExtension = gltf.userData.gltfExtensions['KHR_materials_variants'];
    variants = variantsExtension.variants.map((variant) => variant.name);

    if (variants.length > 0)
        selectVariant(scene, parser, variantsExtension, variants[0]);
}

// controls
let controls;
if (useOrbitControls) {
    controls = new OrbitControls(camera, renderer.domElement);
    camera.position.set(0, 2, 10);
    controls.update();
}
else {
    controls = new FlyControls(camera, renderer.domElement);
    controls.dragToLook = true;
    controls.rollSpeed = 0.05;
}

// variant autoswitch
window.setInterval(function () {
    selectVariant(scene, parser, variantsExtension, variants[index++ % variants.length]);
}, 1000);

// frame advance
if (!useWebGPU)
    animate();

function animate() {
    requestAnimationFrame(animate);

    if (useOrbitControls)
        controls.update();
    else
        controls.update(0.16);

    let vec = new THREE.Vector3;
    camera.getWorldDirection(vec);
    light.position.x = -vec.x;
    light.position.y = -vec.y;
    light.position.z = -vec.z;

    if (!useWebGPU) {
        const phi = THREE.MathUtils.degToRad(90 - (new Date().getTime() / 1000) % 180);
        const theta = THREE.MathUtils.degToRad(180);
        let sun = new THREE.Vector3();
        sun.setFromSphericalCoords(1, phi, theta);
        uniforms['sunPosition'].value.copy(sun);
    }

    renderer.render(scene, camera);
}

// utilities
function selectVariant(scene, parser, extension, variantName) {
    const variantIndex = extension.variants.findIndex((v) => v.name.includes(variantName));
    scene.traverse(
        async (object) => {
            if (!object.isMesh || !object.userData.gltfExtensions)
                return;

            const meshVariantDef = object.userData.gltfExtensions['KHR_materials_variants'];

            if (!meshVariantDef)
                return;

            if (!object.userData.originalMaterial) {
                object.userData.originalMaterial = object.material;
            }

            const mapping = meshVariantDef.mappings.find((mapping) => mapping.variants.includes(variantIndex));

            if (mapping) {
                object.material = await parser.getDependency('material', mapping.material);
                parser.assignFinalMaterial(object);
            }
            else {
                object.material = object.userData.originalMaterial;
            }
        });
}