// Registry of bundled point clouds available to MURMUR.
// Each entry describes a cloud file and how to load it.

const cloudManifest = [
  {
    id:           'default-grove',
    name:         'Default Grove',
    file:         '/clouds/default-grove.ply',
    meta:         '/clouds/default-grove.meta.json',
    targetPoints: 120_000,
  },
  {
    id:           'model',
    name:         'Model (test)',
    file:         '/clouds/model.ply',
    meta:         null,
    targetPoints: 240_000,
  },
]

export default cloudManifest
