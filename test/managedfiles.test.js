const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')

const {
    cleanupRemovedManagedFiles,
    getModulePaths,
    getManifestPath
} = require('../app/assets/js/managedfiles')

test('getModulePaths includes nested distribution modules', () => {
    const modules = [
        {
            getPath: () => '/game/common/mod-a.jar',
            subModules: [
                { getPath: () => '/game/instance/server/mod-b.jar', subModules: [] }
            ]
        }
    ]

    const distribution = {
        servers: [
            { modules }
        ]
    }

    assert.deepEqual(
        [...getModulePaths(distribution)].sort(),
        ['/game/common/mod-a.jar', '/game/instance/server/mod-b.jar']
    )
})

test('first manifest creation never deletes existing files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pokeaurora-managed-'))
    const launcher = path.join(root, 'launcher')
    const common = path.join(root, 'common')
    const instances = path.join(root, 'instances')
    await fs.ensureDir(launcher)
    await fs.ensureDir(common)
    await fs.ensureDir(instances)

    const stale = path.join(common, 'old.jar')
    await fs.writeFile(stale, 'keep on first run')

    const distribution = {
        servers: [
            {
                modules: [
                    { getPath: () => path.join(common, 'new.jar'), subModules: [] }
                ]
            }
        ]
    }

    await cleanupRemovedManagedFiles({
        launcherDirectory: launcher,
        distribution,
        commonDirectory: common,
        instanceDirectory: instances
    })

    assert.equal(await fs.pathExists(stale), true)
    assert.equal(await fs.pathExists(getManifestPath(launcher)), true)
    await fs.remove(root)
})

test('only files from the previous managed manifest are removed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pokeaurora-managed-'))
    const launcher = path.join(root, 'launcher')
    const common = path.join(root, 'common')
    const instances = path.join(root, 'instances')
    await fs.ensureDir(launcher)
    await fs.ensureDir(common)
    await fs.ensureDir(instances)

    const removed = path.join(common, 'removed.jar')
    const userFile = path.join(common, 'my-custom-mod.jar')
    const kept = path.join(common, 'kept.jar')
    await fs.writeFile(removed, 'old')
    await fs.writeFile(userFile, 'user')
    await fs.writeFile(kept, 'kept')

    await fs.writeJson(getManifestPath(launcher), {
        version: 1,
        files: [removed, kept]
    })

    const distribution = {
        servers: [
            {
                modules: [
                    { getPath: () => kept, subModules: [] }
                ]
            }
        ]
    }

    const result = await cleanupRemovedManagedFiles({
        launcherDirectory: launcher,
        distribution,
        commonDirectory: common,
        instanceDirectory: instances
    })

    assert.deepEqual(result.removed, [path.resolve(removed)])
    assert.equal(await fs.pathExists(removed), false)
    assert.equal(await fs.pathExists(userFile), true)
    assert.equal(await fs.pathExists(kept), true)
    await fs.remove(root)
})

test('managed cleanup refuses paths outside launcher data directories', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pokeaurora-managed-'))
    const launcher = path.join(root, 'launcher')
    const common = path.join(root, 'common')
    const instances = path.join(root, 'instances')
    const outside = path.join(root, 'outside.jar')
    await fs.ensureDir(launcher)
    await fs.ensureDir(common)
    await fs.ensureDir(instances)
    await fs.writeFile(outside, 'must survive')

    await fs.writeJson(getManifestPath(launcher), {
        version: 1,
        files: [outside]
    })

    const distribution = { servers: [{ modules: [] }] }
    const result = await cleanupRemovedManagedFiles({
        launcherDirectory: launcher,
        distribution,
        commonDirectory: common,
        instanceDirectory: instances
    })

    assert.equal(await fs.pathExists(outside), true)
    assert.equal(result.skipped[0].reason, 'outside-managed-directories')
    await fs.remove(root)
})
