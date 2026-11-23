// Node 测试用：给无扩展名的相对导入补 .ts，配合 --experimental-strip-types
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) {
      return nextResolve(specifier + '.ts', context)
    }
    throw err
  }
}
