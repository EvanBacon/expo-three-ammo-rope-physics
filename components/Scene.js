//https://threejs.org/examples/webgl_physics_convex_break.html

import Expo from 'expo';
import React from 'react';
import ExpoTHREE from 'expo-three';
import Touches from '../window/Touches';
import Files from '../Files';
import { Dimensions } from 'react-native';
import { ThreeView } from './index';

import THREE from '../Three';

const { Ammo } = global;

const USE_SHADOWS = false;
const USE_AR = false;

class Scene extends React.Component {
  static defaultProps = {
    onLoadingUpdated: ({ loaded, total }) => {},
    onFinishedLoading: () => {},
  };

  mouseCoords = new THREE.Vector2();
  raycaster = new THREE.Raycaster();
  ballMaterial = new THREE.MeshPhongMaterial({ color: 0x202020 });

  gravityConstant = -9.8;
  collisionConfiguration;
  physicsWorld;
  margin = 0.05;

  // Rigid bodies include all movable objects
  rigidBodies = [];

  pos = new THREE.Vector3();
  quat = new THREE.Quaternion();
  transformAux1 = new Ammo.btTransform();
  tempBtVec3_1 = new Ammo.btVector3(0, 0, 0);

  time = 0;

  objectsToRemove = [];

  numObjectsToRemove = 0;

  impactPoint = new THREE.Vector3();
  impactNormal = new THREE.Vector3();

  clickRequest = false;
  pos = new THREE.Vector3();
  quat = new THREE.Quaternion();
  // Physics variables
  softBodies = [];
  softBodyHelpers = new Ammo.btSoftBodyHelpers();

  dispatcher;
  broadphase;
  solver;
  softBodySolver;

  hinge;
  rope;
  armMovement = 0;

  shouldComponentUpdate(nextProps, nextState) {
    const { props, state } = this;
    return false;
  }

  render() {
    return (
      <ThreeView
        style={{ flex: 1 }}
        onContextCreate={this.onContextCreateAsync}
        render={this.animate}
        enableAR={USE_AR}
      />
    );
  }

  onContextCreateAsync = async (gl, arSession) => {
    const { width, height, scale } = Dimensions.get('window');

    for (var i = 0; i < 500; i++) {
      this.objectsToRemove[i] = null;
    }

    // renderer
    this.renderer = ExpoTHREE.createRenderer({ gl });
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 1.0);
    this.renderer.shadowMap.enabled = USE_SHADOWS;

    this.setupScene(arSession);

    // resize listener
    Dimensions.addEventListener('change', this.onResize);

    this.setupPhysics();

    // // setup custom world
    await this.setupWorldAsync();
    await this.createObjects();
    this.setupInput();

    this.props.onFinishedLoading();
  };

  setupPhysics = () => {
    // Physics configuration
    const collisionConfiguration = new Ammo.btSoftBodyRigidBodyCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    const softBodySolver = new Ammo.btDefaultSoftBodySolver();
    this.physicsWorld = new Ammo.btSoftRigidDynamicsWorld(
      dispatcher,
      broadphase,
      solver,
      collisionConfiguration,
      softBodySolver
    );
    this.physicsWorld.setGravity(new Ammo.btVector3(0, this.gravityConstant, 0));
    this.physicsWorld.getWorldInfo().set_m_gravity(new Ammo.btVector3(0, this.gravityConstant, 0));
  };

  createObjects = async () => {
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    // Ground
    pos.set(0, -0.5, 0);
    quat.set(0, 0, 0, 1);
    const ground = this.createParalellepiped(
      40,
      1,
      40,
      0,
      pos,
      quat,
      new THREE.MeshPhongMaterial({ color: 0xffffff })
    );
    ground.castShadow = USE_SHADOWS;
    ground.receiveShadow = USE_SHADOWS;
    const texture = await ExpoTHREE.createTextureAsync({
      asset: Expo.Asset.fromModule(Files.textures.grid),
    });

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(40, 40);
    ground.material.map = texture;
    ground.material.needsUpdate = true;

    // Ball
    const ballMass = 1.2;
    const ballRadius = 0.6;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(ballRadius, 20, 20),
      new THREE.MeshPhongMaterial({ color: 0x202020 })
    );
    ball.castShadow = USE_SHADOWS;
    ball.receiveShadow = USE_SHADOWS;
    const ballShape = new Ammo.btSphereShape(ballRadius);
    ballShape.setMargin(this.margin);
    pos.set(-3, 2, 0);
    quat.set(0, 0, 0, 1);
    this.createRigidBody(ball, ballShape, ballMass, pos, quat);
    ball.userData.physicsBody.setFriction(0.5);
    // Wall
    const brickMass = 0.5;
    const brickLength = 1.2;
    const brickDepth = 0.6;
    const brickHeight = brickLength * 0.5;
    const numBricksLength = 6;
    const numBricksHeight = 8;
    const z0 = -numBricksLength * brickLength * 0.5;
    pos.set(0, brickHeight * 0.5, z0);
    quat.set(0, 0, 0, 1);
    for (let j = 0; j < numBricksHeight; j++) {
      const oddRow = j % 2 == 1;
      pos.z = z0;
      if (oddRow) {
        pos.z -= 0.25 * brickLength;
      }
      const nRow = oddRow ? numBricksLength + 1 : numBricksLength;
      for (var i = 0; i < nRow; i++) {
        let brickLengthCurrent = brickLength;
        let brickMassCurrent = brickMass;
        if (oddRow && (i == 0 || i == nRow - 1)) {
          brickLengthCurrent *= 0.5;
          brickMassCurrent *= 0.5;
        }
        const brick = this.createParalellepiped(
          brickDepth,
          brickHeight,
          brickLengthCurrent,
          brickMassCurrent,
          pos,
          quat,
          createMaterial()
        );
        brick.castShadow = USE_SHADOWS;
        brick.receiveShadow = USE_SHADOWS;
        if (oddRow && (i == 0 || i == nRow - 2)) {
          pos.z += 0.75 * brickLength;
        } else {
          pos.z += brickLength;
        }
      }
      pos.y += brickHeight;
    }
    // The rope
    // Rope graphic object
    const ropeNumSegments = 10;
    const ropeLength = 4;
    const ropeMass = 3;
    const ropePos = ball.position.clone();
    ropePos.y += ballRadius;
    const segmentLength = ropeLength / ropeNumSegments;
    const ropeGeometry = new THREE.BufferGeometry();
    const ropeMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const ropePositions = [];
    const ropeIndices = [];
    for (var i = 0; i < ropeNumSegments + 1; i++) {
      ropePositions.push(ropePos.x, ropePos.y + i * segmentLength, ropePos.z);
    }
    for (var i = 0; i < ropeNumSegments; i++) {
      ropeIndices.push(i, i + 1);
    }
    ropeGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array(ropeIndices), 1));
    ropeGeometry.addAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(ropePositions), 3)
    );
    ropeGeometry.computeBoundingSphere();
    this.rope = new THREE.LineSegments(ropeGeometry, ropeMaterial);
    this.rope.castShadow = USE_SHADOWS;
    this.rope.receiveShadow = USE_SHADOWS;
    this.scene.add(this.rope);
    // Rope physic object
    const softBodyHelpers = new Ammo.btSoftBodyHelpers();
    const ropeStart = new Ammo.btVector3(ropePos.x, ropePos.y, ropePos.z);
    const ropeEnd = new Ammo.btVector3(ropePos.x, ropePos.y + ropeLength, ropePos.z);
    const ropeSoftBody = softBodyHelpers.CreateRope(
      this.physicsWorld.getWorldInfo(),
      ropeStart,
      ropeEnd,
      ropeNumSegments - 1,
      0
    );
    const sbConfig = ropeSoftBody.get_m_cfg();
    sbConfig.set_viterations(10);
    sbConfig.set_piterations(10);
    ropeSoftBody.setTotalMass(ropeMass, false);
    Ammo.castObject(ropeSoftBody, Ammo.btCollisionObject)
      .getCollisionShape()
      .setMargin(this.margin * 3);
    this.physicsWorld.addSoftBody(ropeSoftBody, 1, -1);
    this.rope.userData.physicsBody = ropeSoftBody;
    // Disable deactivation
    ropeSoftBody.setActivationState(4);
    // The base
    const armMass = 2;
    const armLength = 3;
    const pylonHeight = ropePos.y + ropeLength;
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x606060 });
    pos.set(ropePos.x, 0.1, ropePos.z - armLength);
    quat.set(0, 0, 0, 1);
    const base = this.createParalellepiped(1, 0.2, 1, 0, pos, quat, baseMaterial);
    base.castShadow = USE_SHADOWS;
    base.receiveShadow = USE_SHADOWS;
    pos.set(ropePos.x, 0.5 * pylonHeight, ropePos.z - armLength);
    const pylon = this.createParalellepiped(0.4, pylonHeight, 0.4, 0, pos, quat, baseMaterial);
    pylon.castShadow = USE_SHADOWS;
    pylon.receiveShadow = USE_SHADOWS;
    pos.set(ropePos.x, pylonHeight + 0.2, ropePos.z - 0.5 * armLength);
    const arm = this.createParalellepiped(
      0.4,
      0.4,
      armLength + 0.4,
      armMass,
      pos,
      quat,
      baseMaterial
    );
    arm.castShadow = USE_SHADOWS;
    arm.receiveShadow = USE_SHADOWS;
    // Glue the rope extremes to the ball and the arm
    const influence = 1;
    ropeSoftBody.appendAnchor(0, ball.userData.physicsBody, true, influence);
    ropeSoftBody.appendAnchor(ropeNumSegments, arm.userData.physicsBody, true, influence);
    // Hinge constraint to move the arm
    const pivotA = new Ammo.btVector3(0, pylonHeight * 0.5, 0);
    const pivotB = new Ammo.btVector3(0, -0.2, -armLength * 0.5);
    const axis = new Ammo.btVector3(0, 1, 0);
    this.hinge = new Ammo.btHingeConstraint(
      pylon.userData.physicsBody,
      arm.userData.physicsBody,
      pivotA,
      pivotB,
      axis,
      axis,
      true
    );
    this.physicsWorld.addConstraint(this.hinge, true);
  };

  createParalellepiped = (sx, sy, sz, mass, pos, quat, material) => {
    const threeObject = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1), material);
    const shape = new Ammo.btBoxShape(new Ammo.btVector3(sx * 0.5, sy * 0.5, sz * 0.5));
    shape.setMargin(this.margin);
    this.createRigidBody(threeObject, shape, mass, pos, quat);
    return threeObject;
  };
  createRigidBody = (threeObject, physicsShape, mass, pos, quat) => {
    threeObject.position.copy(pos);
    threeObject.quaternion.copy(quat);
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
    transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
    const motionState = new Ammo.btDefaultMotionState(transform);
    const localInertia = new Ammo.btVector3(0, 0, 0);
    physicsShape.calculateLocalInertia(mass, localInertia);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(
      mass,
      motionState,
      physicsShape,
      localInertia
    );
    const body = new Ammo.btRigidBody(rbInfo);
    threeObject.userData.physicsBody = body;
    this.scene.add(threeObject);
    if (mass > 0) {
      this.rigidBodies.push(threeObject);
      // Disable deactivation
      body.setActivationState(4);
    }
    this.physicsWorld.addRigidBody(body);
    return body;
  };

  setupScene = arSession => {
    const { width, height, scale } = Dimensions.get('window');

    // scene
    this.scene = new THREE.Scene();

    if (USE_AR) {
      // AR Background Texture
      this.scene.background = ExpoTHREE.createARBackgroundTexture(arSession, this.renderer);

      /// AR Camera
      this.camera = ExpoTHREE.createARCamera(arSession, width, height, 0.01, 1000);
    } else {
      // Standard Background
      this.scene.background = new THREE.Color(0xbfd1e5);
      this.scene.fog = new THREE.FogExp2(0xbfd1e5, 0.002);

      /// Standard Camera
      this.camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 2000);
      this.camera.position.set(-14, 8, 16);

      // controls
      this.controls = new THREE.OrbitControls(this.camera);
      this.controls.target.set(0, 2, 0);
    }
  };

  setupLights = () => {
    const ambientLight = new THREE.AmbientLight(0x707070);
    this.scene.add(ambientLight);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(-1.0, 1.8, 0.5);
    light.castShadow = USE_SHADOWS;
    if (USE_SHADOWS) {
      var d = 1.4;
      light.shadow.camera.left = -d;
      light.shadow.camera.right = d;
      light.shadow.camera.top = d;
      light.shadow.camera.bottom = -d;

      light.shadow.camera.near = 0.2;
      light.shadow.camera.far = 5.0;

      light.shadow.mapSize.x = 1024;
      light.shadow.mapSize.y = 1024;
    }

    this.scene.add(light);
  };

  setupInput = () => {
    window.document.addEventListener(
      'touchstart',
      event => {
        if (event.pageX < Dimensions.get('window').width / 2) {
          this.armMovement = -1;
        } else {
          this.armMovement = 1;
        }
      },
      false
    );

    window.document.addEventListener(
      'touchend',
      event => {
        this.armMovement = 0;
      },
      false
    );
  };

  setupWorldAsync = async () => {
    this.setupLights();
  };

  onResize = () => {
    const { width, height, scale } = Dimensions.get('window');

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(width, height);
  };

  animate = delta => {
    this.updatePhysics(delta);

    // Render the scene
    this.renderer.render(this.scene, this.camera);

    this.time += delta;
  };

  //http://bulletphysics.org/mediawiki-1.5.8/index.php/Stepping_The_World
  fixedTimeStep = 1 / 30;
  maxSubSteps = 1;
  updatePhysics = deltaTime => {
    // Step world
    this.physicsWorld.stepSimulation(deltaTime, this.maxSubSteps, this.fixedTimeStep);

    // Hinge control
    this.hinge.enableAngularMotor(true, 1.5 * this.armMovement, 50);
    // Step world
    // Update rope
    const softBody = this.rope.userData.physicsBody;
    const ropePositions = this.rope.geometry.attributes.position.array;
    const numVerts = ropePositions.length / 3;
    const nodes = softBody.get_m_nodes();
    let indexFloat = 0;
    for (var i = 0; i < numVerts; i++) {
      const node = nodes.at(i);
      const nodePos = node.get_m_x();
      ropePositions[indexFloat++] = nodePos.x();
      ropePositions[indexFloat++] = nodePos.y();
      ropePositions[indexFloat++] = nodePos.z();
    }
    this.rope.geometry.attributes.position.needsUpdate = true;
    // Update rigid bodies
    for (let i = 0, il = this.rigidBodies.length; i < il; i++) {
      const objThree = this.rigidBodies[i];
      const objPhys = objThree.userData.physicsBody;
      const ms = objPhys.getMotionState();
      if (ms) {
        ms.getWorldTransform(this.transformAux1);
        const p = this.transformAux1.getOrigin();
        const q = this.transformAux1.getRotation();
        objThree.position.set(p.x(), p.y(), p.z());
        objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());
      }
    }
  };
}

function createRandomColor() {
  return Math.floor(Math.random() * (1 << 24));
}

function createMaterial(color) {
  color = color || createRandomColor();
  return new THREE.MeshPhongMaterial({ color });
}

export default Touches(Scene);
