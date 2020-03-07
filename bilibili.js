const fs = require('fs')
const path = require('path')
const axios = require('axios')
const commander = require('commander')
const { from } = require('rxjs')
const { mergeMap } = require('rxjs/operators')

commander
    .requiredOption('-u, --uid <number>', 'Bilibili uid')
    .requiredOption('-d, --directory <string>', 'Output directory', './')
    .option('-t, --threads <number>', 'Download threads',5)
    .option('-o, --output-file', 'Output files')

commander.parse(process.argv)

let bilibiliUid = null
const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.122 Safari/537.36`
const pageSize = 30
let thread = 5
let outputFile = false
let directory = null

if (commander.uid){
    bilibiliUid = commander.uid
}
if (commander.directory){
    directory = path.join(commander.directory)
}
if (commander.threads){
    thread = Number(commander.threads)
}
if (commander.outputFile){
    outputFile = true
}

console.log(`Input config`)
console.log(`-------------------`)
console.log(`uid: ${ bilibiliUid }`)
console.log(`output directory: ${ directory }`)
console.log(`thread: ${ thread }`)
console.log(`output files: ${ outputFile }`)
console.log(`-------------------`)

async function findPictures(){
    const count = await axios.get('https://api.vc.bilibili.com/link_draw/v1/doc/upload_count', {
        headers: {
            'User-Agent': userAgent
        },
        params: {
            uid: bilibiliUid
        },
        transformResponse: data => {
            const resp = JSON.parse(data)
            return resp.data.all_count
        }
    })

    const quest = []

    for (let index = 0; index < Math.ceil(count.data / pageSize); index++){
        console.log(`Analyze page: ${ (index + 1) }/${ Math.ceil(count.data / pageSize) }`)

        quest.push(axios.get('https://api.vc.bilibili.com/link_draw/v1/doc/doc_list', {
            headers: {
                'User-Agent': userAgent
            },
            params: {
                uid: bilibiliUid,
                page_num: index,
                page_size: pageSize,
                biz: 'all'
            },
            transformResponse: data => {
                const resp = JSON.parse(data)
                const items = resp.data.items
                let arr = []

                for (const item of items){
                    const pictures = []

                    for (const subItem of item.pictures){
                        pictures.push(subItem.img_src)
                    }

                    arr = arr.concat(pictures)
                }

                return arr
            }
        }))
    }

    const list = await axios.all(quest)
    let pictures = []

    for (const item of list){
        pictures = pictures.concat(item.data)
    }

    return pictures
}

function writeFile(items){
    let str = ''

    for (const item of items){
        str += `${ item }\n`
    }

    fs.writeFileSync(path.join(directory, `bilibili-${ bilibiliUid }.txt`), str)
}

function download(items){
    let currentIndex = 0
    const dir = path.join(directory, bilibiliUid)

    fs.mkdirSync(dir, { recursive: true })

    from(items)
        .pipe(
            mergeMap(item => {
                return from(axios.get(item, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': userAgent
                    }
                }))
            }, thread))
        .subscribe(result => {
            const filename = result.request.path.match(/[a-zA-Z0-9.]*$/gi)[0]
            console.log(`Download: ${ (currentIndex += 1) }/${ items.length } ${ (currentIndex / items.length * 100).toFixed(2) }%`)
            fs.writeFileSync(path.join(dir, filename), result.data)
        })
}

async function main(){
    const items = await findPictures()

    writeFile(items)
    if (outputFile){
        download(items)
    }
}

main()
