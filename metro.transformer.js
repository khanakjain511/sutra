const dynamicImport = 'import(/*webpackIgnore:true*/t)';

function withoutDynamicImport(data) {
  const source = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  if (!source.includes(dynamicImport)) return data;
  return Buffer.from(
    source.replaceAll(
      dynamicImport,
      '(Promise.reject(new Error("onnxruntime dynamic import is unused")))',
    ),
  );
}

module.exports.transform = function transform(
  config,
  projectRoot,
  filename,
  data,
  options,
) {
  const { attendanceUpstreamTransformer, ...upstreamConfig } = config;
  const patched = filename.includes('onnxruntime-web')
    ? withoutDynamicImport(data)
    : data;
  return require(attendanceUpstreamTransformer).transform(
    upstreamConfig,
    projectRoot,
    filename,
    patched,
    options,
  );
};
