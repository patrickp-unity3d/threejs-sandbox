import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { GroundProjectedSkybox } from "three/addons/objects/GroundProjectedSkybox.js";

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setAnimationLoop(render);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 5;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

let scene = new THREE.Scene();

let camera = new THREE.PerspectiveCamera(23, window.innerWidth / window.innerHeight, 0.25, 200);
camera.position.set(6, 2, 10);

let composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType }));

/*
let ssrPass = new SSRPass({
    renderer,
    scene,
    camera,
    width: innerWidth,
    height: innerHeight,
    groundReflector: null,
    selects: null
});
ssrPass.opacity = 1;

composer.addPass(ssrPass);
//composer.addPass(new ShaderPass(GammaCorrectionShader));
*/

// taa
let taaRenderPass = new TAARenderPass(scene, camera);
taaRenderPass.unbiased = false; // we're using half floats anyways
taaRenderPass.enabled = true;
taaRenderPass.sampleLevel = 3;
taaRenderPass.accumulate = false;
composer.addPass(taaRenderPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.85;
bloomPass.strength = 1;
bloomPass.radius = 0.25;
composer.addPass(bloomPass);

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
const geometry = new THREE.PlaneGeometry(100, 100);
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

// load low res dome and reflection map
new RGBELoader().setPath('assets/').load('construction_2k.hdr', function (texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;

    scene.background = texture;
    scene.environment = texture;

    // create low res dome
    let ground = new GroundProjectedSkybox(texture);
    ground.scale.setScalar(35);
    ground.height = 3;
    scene.add(ground);

    render();

    // load hires dome
    new RGBELoader().setPath('assets/').loadAsync('construction_8k.hdr', progress => {
        render();
    }).then(texture => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;

        // remove low res dome
        scene.remove(ground);

        // add 'gumdrop' dome
        ground = new GroundProjectedSkybox(texture);
        ground.scale.setScalar(35);
        ground.height = 3;
        scene.add(ground);

        render();
    });

    // yard
    new GLTFLoader().setPath('assets/').loadAsync('construction.glb').then(gltf => {
        /* having a hard time tuning the shadow casting light for a larg-ish scene, we'll have the product only cast a shadow for now
        // enable shadows
        gltf.scene.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        */
        scene.add(gltf.scene);

        // hide unwanted meshes
        gltf.scene.getObjectByName('CircularFloor').visible = false;

        // disable sun and use shadow only
        let sun = gltf.scene.getObjectByName('Sun_Light');
        sun.castShadow = true;
        sun.intensity = 1.0;

        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.near = 0.5; //default
        sun.shadow.camera.far = 500; //default

        // give a better orientation - is the glb coordinate system for lights correct?
        sun.target = plane;
        sun.position.set(50, 20, 0);

        render();
    });

    // model
    new GLTFLoader().setPath('assets/').loadAsync('skidLoader.glb').then(gltf => {
        gltf.scene.rotation.set(0, THREE.MathUtils.degToRad(90), 0);

        // look at center of the model
        let box = new THREE.Box3().setFromObject(gltf.scene);
        let sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        controls.target.set(sphere.center.x, sphere.center.y, sphere.center.z);
        controls.update();

        // enable shadows
        gltf.scene.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // reflection debugging only
                /*child.material.metalness = 0.5;
                child.material.roughness = 0;*/
            }
        });

        scene.add(gltf.scene);

        // use proper fork color
        gltf.scene.getObjectByName('Forks_Frame-1').traverse(child => {
            if (child.isMesh)
                child.material.color.set(0x000000);
        });

        // hide unwanted meshes and lights
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
    composer.render();
}
