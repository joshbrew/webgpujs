import exclusiveScan from "./exclusive-scan/index.js";
import segmentedScan from "./segmented-scan/index.js";
import l2Norm from "./l2-norm/index.js";
import argmax from "./argmax/index.js";
import variance from "./variance/index.js";
import softmax from "./softmax/index.js";
import rowNormalization from "./row-normalization/index.js";
import cosineSimilarity from "./cosine-similarity/index.js";
import batchedDot from "./batched-dot/index.js";
import sparseMatvec from "./sparse-matvec/index.js";
import jacobi from "./jacobi/index.js";
import convolution from "./convolution/index.js";
import medianFilter from "./median-filter/index.js";
import kmeans from "./kmeans/index.js";
import gpuHash from "./gpu-hash/index.js";
import graphBfs from "./graph-bfs/index.js";
import streamingBiquad from "./streaming-biquad/index.js";
import stft from "./stft/index.js";
import coherence from "./coherence/index.js";
import overlapAdd from "./overlap-add/index.js";
import dctCompression from "./dct-compression/index.js";
import haarWavelet from "./haar-wavelet/index.js";
import hilbertEnvelope from "./hilbert-envelope/index.js";
import phaseCorrelation from "./phase-correlation/index.js";
import deferredLighting from "./deferred-lighting/index.js";
import stencilPortal from "./stencil-portal/index.js";
import indirectCulling from "./indirect-culling/index.js";
import occlusionQuery from "./occlusion-query/index.js";
import timestampQuery from "./timestamp-query/index.js";
import halfPrecision from "./half-precision/index.js";
import mipmaps from "./mipmaps/index.js";
import volumeTexture from "./volume-texture/index.js";
import cubeReflection from "./cube-reflection/index.js";
import shadowMap from "./shadow-map/index.js";
import renderBundles from "./render-bundles/index.js";
import textureArray from "./texture-array/index.js";
import voxelWorkgroups from "./voxel-workgroups/index.js";
import meshNormals from "./mesh-normals/index.js";
import histogramEqualization from "./histogram-equalization/index.js";
import triangle from "./triangle/index.js";
import cube from "./cube/index.js";
import videoAscii from "./video-ascii/index.js";
import torus from "./torus/index.js";
import softShadows from "./soft-shadows/index.js";
import bump from "./bump/index.js";
import ocean from "./ocean/index.js";
import game from "./game/index.js";
import boids from "./boids/index.js";
import particles from "./particles/index.js";
import life from "./life/index.js";
import waves from "./waves/index.js";
import nbody from "./nbody/index.js";
import cloth from "./cloth/index.js";
import reaction from "./reaction/index.js";
import heat from "./heat/index.js";
import cyclic from "./cyclic/index.js";
import excitable from "./excitable/index.js";
import coupled from "./coupled/index.js";
import dft from "./dft/index.js";
import fft from "./fft/index.js";
import spectral from "./spectral/index.js";
import fir from "./fir/index.js";
import batchFft from "./batch-fft/index.js";
import fft2d from "./fft-2d/index.js";
import correlation from "./correlation/index.js";
import interference from "./interference/index.js";
import diffraction from "./diffraction/index.js";
import implicitChain from "./implicit-chain/index.js";
import histogram from "./histogram/index.js";
import reduction from "./reduction/index.js";
import matrix from "./matrix/index.js";
import sort from "./sort/index.js";
import scan from "./scan/index.js";
import compact from "./compact/index.js";
import nearest from "./nearest/index.js";
import rle from "./rle/index.js";
import spatial from "./spatial/index.js";
import textureChain from "./texture-chain/index.js";
import integral from "./integral/index.js";
import sobel from "./sobel/index.js";
import bloom from "./bloom/index.js";
import sharpen from "./sharpen/index.js";
import emboss from "./emboss/index.js";
import pixelate from "./pixelate/index.js";
import dither from "./dither/index.js";
import chromatic from "./chromatic/index.js";
import mosaic from "./mosaic/index.js";
import mandelbrot from "./mandelbrot/index.js";
import julia from "./julia/index.js";
import burningShip from "./burning-ship/index.js";
import metaballs from "./metaballs/index.js";
import voronoi from "./voronoi/index.js";
import terrain from "./terrain/index.js";
import warp from "./warp/index.js";
import kaleidoscope from "./kaleidoscope/index.js";
import tunnel from "./tunnel/index.js";
import newton from "./newton/index.js";
import gyroid from "./gyroid/index.js";
import menger from "./menger/index.js";
import caustics from "./caustics/index.js";

// The gallery and editor only choose presentation; each demo owns its GPU workflow.
export const demos = [
  exclusiveScan,
  segmentedScan,
  l2Norm,
  argmax,
  variance,
  softmax,
  rowNormalization,
  cosineSimilarity,
  batchedDot,
  sparseMatvec,
  jacobi,
  convolution,
  medianFilter,
  kmeans,
  gpuHash,
  graphBfs,
  streamingBiquad,
  stft,
  coherence,
  overlapAdd,
  dctCompression,
  haarWavelet,
  hilbertEnvelope,
  phaseCorrelation,
  deferredLighting,
  stencilPortal,
  indirectCulling,
  occlusionQuery,
  timestampQuery,
  halfPrecision,
  mipmaps,
  volumeTexture,
  cubeReflection,
  shadowMap,
  renderBundles,
  textureArray,
  voxelWorkgroups,
  meshNormals,
  histogramEqualization,
  triangle,
  cube,
  videoAscii,
  torus,
  softShadows,
  bump,
  ocean,
  game,
  boids,
  particles,
  life,
  waves,
  nbody,
  cloth,
  reaction,
  heat,
  cyclic,
  excitable,
  coupled,
  dft,
  fft,
  spectral,
  fir,
  batchFft,
  fft2d,
  correlation,
  interference,
  diffraction,
  implicitChain,
  histogram,
  reduction,
  matrix,
  sort,
  scan,
  compact,
  nearest,
  rle,
  spatial,
  textureChain,
  integral,
  sobel,
  bloom,
  sharpen,
  emboss,
  pixelate,
  dither,
  chromatic,
  mosaic,
  mandelbrot,
  julia,
  burningShip,
  metaballs,
  voronoi,
  terrain,
  warp,
  kaleidoscope,
  tunnel,
  newton,
  gyroid,
  menger,
  caustics,
];
