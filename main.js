import * as THREE from 'three';

import WebGPU from 'three/addons/capabilities/WebGPU.js';
import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { GroundProjectedSkybox } from "three/addons/objects/GroundProjectedSkybox.js";

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

const param = { TAAEnabled: '1', TAASampleLevel: 5 };

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
    renderer = new THREE.WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: false
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 3;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(23, window.innerWidth / window.innerHeight, 0.1, 1000);

// taa
let composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {type: THREE.HalfFloatType}));

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

// staging
const light = new THREE.DirectionalLight(0xffffff, 0.5);
scene.add(light)
scene.background = new THREE.Color(0x606060);

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

// frame advance
if (!useWebGPU)
    animate();

new RGBELoader().setPath('assets/').loadAsync('construction_2k.hdr').then(texture => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.anisotropy = 1;
    texture.generateMipmaps = false;
    texture.encoding = THREE.LinearEncoding;
    scene.background = texture;
    scene.environment = texture;

    render();

    // higher res - 8K is the width, unlike in Product Experience where Fred used 8K for height - effectively this 8K is 1/2 the size of Product Experience
    new RGBELoader().setPath('assets/').loadAsync('construction_8k.hdr', progress => {
        console.log(progress);
        render();
    }).then(texture => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.anisotropy = 1;
        texture.generateMipmaps = false;
        texture.encoding = THREE.LinearEncoding;
        scene.background = texture;

        const env = new GroundProjectedSkybox(texture);
        env.scale.setScalar(100);
        env.height = 5;
        scene.add(env);

        render();
    });
});

// glTF
const loader = new GLTFLoader();
let variants = { length: 0 };
let variantIndex = 0;
let parser;
let variantsExtension;

loader.loadAsync('assets/construction.glb').then(gltf => {
    scene.add(gltf.scene);
    gltf.scene.getObjectByName('CircularFloor').visible = false;
});

loader.loadAsync('assets/skidLoader.glb').then(gltf => {
    scene.add(gltf.scene);

    gltf.scene.traverse(function (child) {
        console.log(child.name);
        if (child.name == 'Wheels_Assembly-1' || child.name == 'Brush_Cutter_Assembly-1' || child.name == 'Sweeper_Assembly-1' || child.name == 'Bucket_Assembly-1') {
            child.traverse(function (subchild) {
                subchild.visible = false;
            });
        }
        if (child.type == THREE.SpotLight)
            child.visible = false;
        if (child.type == THREE.DirectionalLight)
            child.visible = false;
        if (child.type == THREE.Light)
            child.visible = false;
    });

    parser = gltf.parser;
    variantsExtension = gltf.userData.gltfExtensions['KHR_materials_variants'];
    if (variantsExtension != undefined)
        variants = variantsExtension.variants.map((variant) => variant.name);

    if (variants.length > 0)
        selectVariant(scene, parser, variantsExtension, variants[0]);
});

// variant autoswitch
window.setInterval(function () {
    if (variants.length > 0)
        selectVariant(scene, parser, variantsExtension, variants[variantIndex++ % variants.length]);
}, 2000);

function animate() {
    requestAnimationFrame(animate);

    render();
}

function render() {
    //index++;

    if (useOrbitControls)
        controls.update();
    else
        controls.update(0.16);

    let vec = new THREE.Vector3;
    camera.getWorldDirection(vec);
    light.position.x = -vec.x;
    light.position.y = -vec.y;
    light.position.z = -vec.z;

    if (taaRenderPass) {
        taaRenderPass.enabled = (param.TAAEnabled === '1');
        renderPass.enabled = (param.TAAEnabled !== '1');
    }
    if (taaRenderPass) {
        taaRenderPass.sampleLevel = param.TAASampleLevel;
    }
    taaRenderPass.accumulate = false;

    composer.render();
    /*
    renderer.render(scene, camera);
    */
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