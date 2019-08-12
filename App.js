import { GraphicsView } from 'expo-graphics';
import * as ImagePicker from 'expo-image-picker';
import * as Permissions from 'expo-permissions';
import { AR, loadTextureAsync, Renderer, THREE } from 'expo-three';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import asset from './assets/marker.jpg';

const {
  PerspectiveCamera,
  BoxBufferGeometry,
  ShaderMaterial,
  PointLight,
  Mesh,
  Color,
  Scene,
} = THREE;

export default function App() {
  const [image, setImage] = useState(asset);

  const scene = new Scene();
  let camera;
  let renderer;

  useEffect(() => {
    THREE.suppressExpoWarnings();
  }, []);

  const setBackground = async asset =>
    (scene.background = await loadTextureAsync({ asset }));

  setBackground(image);

  const onContextCreate = async props => {
    const { width, height } = props;

    camera = new PerspectiveCamera(54.2, width / height, 0.01, 1000);
    renderer = new Renderer(props);

    const material = new ChromaKeyMaterial({
      texture: new AR.BackgroundTexture(renderer),
      color: new Color(`#ffffff`),
    });

    const vHeight = height / width;

    const plane = new BoxBufferGeometry(1, vHeight, 0.1);

    const background = new Mesh(plane, material);

    background.position.set(0, 0, -vHeight);
    scene.add(background);

    // Add lights
    const pointLight = new PointLight(0xffffff);
    pointLight.position.set(2, 2, 2);
    scene.add(pointLight);
  };

  const onResize = ({ scale, width, height }) => {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(scale);
    renderer.setSize(width, height);
  };

  return (
    <View style={styles.container}>
      <GraphicsView
        style={styles.container}
        onContextCreate={onContextCreate}
        onRender={() => renderer.render(scene, camera)}
        onResize={onResize}
        isArEnabled
        isArRunningStateEnabled={false}
        isArCameraStateEnabled={false}
      />
      <ImageButton
        image={image}
        onImage={async uri => {
          if (uri) {
            setImage({ uri });
            setBackground(uri);
          }
        }}
      />
    </View>
  );
}

function ImageButton({ image, onImage }) {
  return (
    <View style={styles.imageWrapper}>
      <Text>Choose an image</Text>
      <TouchableOpacity
        onPress={async () => {
          const uri = await getImageAsync();
          onImage(uri);
        }}
      >
        <Image source={image} style={styles.image} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  imageWrapper: {
    position: 'absolute',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    bottom: 12,
    right: 12,
    opacity: 0.5,
    width: '30%',
  },
  image: {
    maxWidth: '100%',
    height: 100,
    resizeMode: 'contain',
  },
});

async function getImageAsync() {
  const { status } = await Permissions.askAsync(
    Permissions.CAMERA_ROLL,
    Permissions.CAMERA,
  );
  if (status !== 'granted') return;

  const result = await ImagePicker.launchImageLibraryAsync();
  return result.uri;
}

class ChromaKeyMaterial extends ShaderMaterial {
  constructor({ texture, color }) {
    const uniforms = {
      video_texture: {
        type: 't',
        value: texture,
      },
      color: {
        type: 'c',
        value: color,
      },
    };

    super({
      depthWrite: false,
      transparent: true,
      uniforms,
      vertexShader: `
        varying mediump vec2 vUv;
        void main(void) {
          vUv = uv;
          mediump vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: `
        uniform mediump sampler2D video_texture;
        uniform mediump vec3 color;
        varying mediump vec2 vUv;
        void main(void) {
          mediump vec3 tColor = texture2D(video_texture, vUv).rgb;
          mediump float a = (length(tColor - color) - 0.5) * 7.0;
          gl_FragColor = vec4(tColor, a);
        }`,
    });
  }
}
