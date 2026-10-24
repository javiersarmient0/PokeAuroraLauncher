const fs = require('fs-extra')
const path = require('path')

const MANIFEST_VERSION = 1
const MANIFEST_FILENAME = 'pokeaurora-managed-files.json'

function getManifestPath(launcherDirectory){
    return path.join(launcherDirectory, MANIFEST_FILENAME)
}

function isPathInside(root, target){
    const relative = path.relative(path.resolve(root), path.resolve(target))
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function getModulePaths(distribution){
    const files = new Set()

    for(const server of distribution?.servers || []){
        for(const module of walkModules(server.modules || [])){
            const modulePath = module.getPath()
            if(typeof modulePath === 'string' && path.isAbsolute(modulePath)){
                files.add(path.resolve(modulePath))
            }
        }
    }

    return files
}

function* walkModules(modules){
    for(const module of modules){
        yield module
        if(Array.isArray(module.subModules) && module.subModules.length > 0){
            yield* walkModules(module.subModules)
        }
    }
}

function validateManagedPath(target, commonDirectory, instanceDirectory){
    return isPathInside(commonDirectory, target) || isPathInside(instanceDirectory, target)
}

async function hasSymlinkAncestor(target, roots){
    const resolvedTarget = path.resolve(target)

    for(const root of roots){
        const resolvedRoot = path.resolve(root)
        if(!isPathInside(resolvedRoot, resolvedTarget)){
            continue
        }

        const relative = path.relative(resolvedRoot, resolvedTarget)
        const parts = relative.split(path.sep).filter(Boolean)
        let current = resolvedRoot

        for(const part of parts){
            current = path.join(current, part)
            try {
                const stat = await fs.lstat(current)
                if(stat.isSymbolicLink()){
                    return true
                }
            } catch(error){
                if(error.code === 'ENOENT'){
                    break
                }
                throw error
            }
        }
    }

    return false
}

async function readManifest(launcherDirectory){
    const manifestPath = getManifestPath(launcherDirectory)

    try {
        const manifest = await fs.readJson(manifestPath)
        if(manifest?.version !== MANIFEST_VERSION || !Array.isArray(manifest.files)){
            return null
        }
        return manifest
    } catch(error){
        if(error.code === 'ENOENT'){
            return null
        }
        throw error
    }
}

async function writeManifest(launcherDirectory, files){
    const manifestPath = getManifestPath(launcherDirectory)
    const temporaryPath = `${manifestPath}.tmp`
    const manifest = {
        version: MANIFEST_VERSION,
        files: [...files].sort()
    }

    await fs.writeJson(temporaryPath, manifest, { spaces: 2 })
    await fs.move(temporaryPath, manifestPath, { overwrite: true })
}

async function cleanupRemovedManagedFiles({ launcherDirectory, distribution, commonDirectory, instanceDirectory, logger }){
    const currentFiles = getModulePaths(distribution)
    const previousManifest = await readManifest(launcherDirectory)

    // Never delete anything until the launcher has established ownership through
    // a previous manifest. This makes the first run completely non-destructive.
    if(previousManifest == null){
        await writeManifest(launcherDirectory, currentFiles)
        return { removed: [], skipped: [] }
    }

    const currentSet = new Set(currentFiles)
    const removed = []
    const skipped = []

    for(const file of previousManifest.files){
        const target = path.resolve(file)

        if(currentSet.has(target)){
            continue
        }

        if(!validateManagedPath(target, commonDirectory, instanceDirectory)){
            skipped.push({ path: target, reason: 'outside-managed-directories' })
            continue
        }

        if(await hasSymlinkAncestor(target, [commonDirectory, instanceDirectory])){
            skipped.push({ path: target, reason: 'symbolic-link-path' })
            continue
        }

        try {
            const stat = await fs.lstat(target)
            if(!stat.isFile() || stat.isSymbolicLink()){
                skipped.push({ path: target, reason: 'not-regular-file' })
                continue
            }

            await fs.remove(target)
            removed.push(target)
        } catch(error){
            if(error.code === 'ENOENT'){
                continue
            }
            skipped.push({ path: target, reason: error.message })
            logger?.warn(`Unable to remove stale managed file: ${target}`, error)
        }
    }

    await writeManifest(launcherDirectory, currentFiles)
    return { removed, skipped }
}

module.exports = {
    MANIFEST_FILENAME,
    getManifestPath,
    getModulePaths,
    readManifest,
    writeManifest,
    cleanupRemovedManagedFiles
}
