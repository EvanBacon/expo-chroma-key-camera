import { GraphicsView } from 'expo-graphics';
import * as ImagePicker from 'expo-image-picker';
import * as Permissions from 'expo-permissions';
import Constants from 'expo-constants';
import { AR, loadTextureAsync, Renderer, THREE } from 'expo-three';
import React, { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  Slider,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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

let desaturate;
let chroma;

export default function App() {
  const [image, setImage] = useState(asset);
  const [color, setColor] = useState('#ff0000');
  const [desaturation, setDesaturation] = useState(1.0);

  const scene = new Scene();
  let camera;
  let renderer;

  useEffect(() => {
    THREE.suppressExpoWarnings();
  }, []);

  useEffect(() => {
    if (desaturate) {
      desaturate.uniforms.amount.value = desaturation;
    }
  }, [desaturation]);

  useEffect(() => {
    if (chroma) {
      chroma.uniforms.color.value = new Color(color);
    }
  }, [color]);

  const setBackground = async asset =>
    (scene.background = await loadTextureAsync({ asset }));

  setBackground(image);

  const onContextCreate = async props => {
    const { width, height } = props;

    camera = new PerspectiveCamera(54.2, width / height, 0.01, 1000);
    renderer = new Renderer(props);

    const makeImageMesh = material => {
      const vHeight = height / width;

      const plane = new BoxBufferGeometry(1, vHeight, 0.1);

      const background = new Mesh(plane, material);

      background.position.set(0, 0, -vHeight);
      scene.add(background);
    };

    const texture = new AR.BackgroundTexture(renderer);
    chroma = new ChromaKeyMaterial({
      texture,
      color: new Color(color),
      inverse: true,
    });
    desaturate = new SaturateMaterial({
      amount: 1.0,
      texture: texture, //new AR.BackgroundTexture(renderer),
    });
    makeImageMesh(desaturate);
    makeImageMesh(chroma);

    // const vHeight = height / width;

    // const plane = new BoxBufferGeometry(1, vHeight, 0.1);

    // const background = new Mesh(plane, material);

    // background.position.set(0, 0, -vHeight);
    // scene.add(background);

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

      {false && (
        <ImageButton
          image={image}
          onImage={async uri => {
            if (uri) {
              setImage({ uri });
              setBackground(uri);
            }
          }}
        />
      )}

      <Slider
        style={{
          position: 'absolute',
          bottom: 8 + Constants.statusBarHeight,
          right: 16,
          left: 16,
        }}
        minimumValue={0}
        maximumValue={1}
        minimumTrackTintColor="#FFFFFF"
        maximumTrackTintColor={color}
        value={desaturation}
        onValueChange={value => setDesaturation(value)}
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
  setColor(color) {
    this.uniforms.color.value = color;
  }

  constructor({ texture, color, inverse = 0.0 }) {
    const uniforms = {
      video_texture: {
        type: 't',
        value: texture,
      },
      inverse: {
        type: 'f',
        value: inverse ? 1.0 : 0.0,
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
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,

      fragmentShader: `
        uniform mediump sampler2D video_texture;
        uniform mediump vec3 color;
        uniform mediump float inverse;
        varying mediump vec2 vUv;

        vec3 desaturate(vec3 color, float f) {
          vec3 grayXfer = vec3(0.3, 0.59, 0.11);
          vec3 gray = vec3(dot(grayXfer, color));
          return mix(color, gray, f);
        }

        void main(void) {
          mediump vec3 tColor = texture2D(video_texture, vUv).rgb;
          mediump float a = inverse - ((length(tColor - color) - 0.5) * 7.0);
					gl_FragColor = vec4(tColor, a);
        }`,
    });
    this.uniforms = uniforms;
  }
}

class SaturateMaterial extends ShaderMaterial {
  constructor({ texture, amount }) {
    const uniforms = {
      inputTexture: {
        type: 't',
        value: texture,
      },
      amount: {
        type: 'f',
        value: amount,
      },
    };

    super({
      depthWrite: false,
      transparent: false,
      uniforms,
      vertexShader: `
        varying mediump vec2 vUv;
        void main(void) {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,

      fragmentShader: `
        uniform mediump sampler2D inputTexture;
        uniform mediump float amount;
        varying mediump vec2 vUv;

        vec3 desaturate(vec3 color, float f) {
          vec3 grayXfer = vec3(0.3, 0.59, 0.11);
          vec3 gray = vec3(dot(grayXfer, color));
          return mix(color, gray, f);
        }

        void main(void) {
          mediump vec3 tColor = texture2D(inputTexture, vUv).rgb;
					gl_FragColor = vec4(desaturate(tColor, amount), 1.0);
        }`,
    });

    this.uniforms = uniforms;
  }
}
