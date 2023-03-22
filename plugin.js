import AliOSS from 'ali-oss'
import defu from 'defu'
import mime from 'mime'

import crypto from 'ali-oss/shims/crypto/crypto'
import { Buffer } from 'buffer'

import base64js from 'base64-js'

// import MediaInfoFactory from 'mediainfo.js'

const pluginOptions = JSON.parse('<%= JSON.stringify(options) %>')

function combineFileDirectory(filePath, fileObj) {
	let date = new Date()
	let year = date.getFullYear().toString()
	let month = (date.getMonth() + 1).toString().padStart(2, '0')
	let day = date.getDate().toString().padStart(2, '0')
	//文件名 => 文件名base64 - 时间戳
	let { name } = fileObj
	let path = filePath.includes(name)
		? filePath.replace(name, Buffer.from(name, 'utf8').toString('base64') + '-' + Date.now())
		: filePath
	let ext = path.includes('.') ? '' : '.' + name.split('.').pop()
	return year + month + day + '/' + path + ext
}

function combineUploadOptions(accessType, uploadOptions) {
	if (!uploadOptions) {
		let options = defu({}, pluginOptions.upload)
		//公有bucket默认没有callback
		if (accessType === 'public') delete options.callback
		return options
	} else {
		let callback = uploadOptions.callback
		let customValue = callback && callback.customValue
		//自定义参数自动合并到body
		if (customValue && typeof customValue === 'object') {
			let body = [pluginOptions.upload.callback.body || '', callback.body || ''].filter((v) => v !== '')
			callback.body = Object.keys(customValue)
				.reduce((vars, key) => vars.concat(key + '=${x:' + key + '}'), body)
				.join('&')
		}
		let options = defu(uploadOptions, pluginOptions.upload)
		//公有bucket默认没有callback
		if (!callback && accessType === 'public') delete options.callback
		return options
	}
}

async function createMediaInfoInstance(aliossInstance) {
	if (!aliossInstance.mediaInfoInstance)
		aliossInstance.mediaInfoInstance = await MediaInfo({
			format: 'object',
			locateFile: (prefix, path) => path + prefix
		})
	return aliossInstance.mediaInfoInstance
}

function createMediaInfoGetSize(aliossInstance, fileObj) {
	return () => fileObj.size
}

function createMediaInfoReadChunk(aliossInstance, fileObj, onProgress) {
	return (chunkSize, offset) =>
		new Promise((resolve, reject) => {
			const reader = new FileReader()
			if (typeof onProgress === 'function') reader.onprogress = (event) => onProgress(event.loaded / event.total)
			reader.onload = (event) =>
				event.target.error ? reject(event.target.error) : resolve(new Uint8Array(event.target.result))
			reader.readAsArrayBuffer(fileObj.slice(offset, offset + chunkSize))
			aliossInstance.mediaInfoReader = reader
		})
}

function AliOSSPlugin(accessType) {
	this.mediaInfoReader = null
	this.mediaInfoInstance = null
	this.screenshotLoading = false
	this.bucketAccessType = accessType
}

AliOSSPlugin.prototype = {
	/**
	 * 获取字符串MD5值
	 *
	 * @param {String} str 字符串
	 * @returns {Promise}
	 */
	hexMd5(str) {
		return crypto.createHash('md5').update(Buffer.from(str, 'utf8')).digest('hex')
	},
	/**
	 * 获取媒体文件信息
	 * 由于mediainfo.js在nuxt中引入较为麻烦，因为请在局部或全局导入mediainfo.min.js
	 *
	 * @param {File} fileObj 文件对象
	 * @param {Function} onProgress 进度
	 * @returns {Promise}
	 */
	async getMediaInfo(fileObj, onProgress) {
		let instance = await createMediaInfoInstance(this)
		let result = await instance.analyzeData(
			createMediaInfoGetSize(this, fileObj),
			createMediaInfoReadChunk(this, fileObj, onProgress)
		)
		return result.media ? result.media.track : null
	},
	/**
	 * 获取视频截图
	 *
	 * @param {File} fileObj
	 * @param {Number} currentTime
	 * @returns
	 */
	getVideoScreenshot(fileObj, currentTime) {
		return new Promise((resolve, reject) => {
			if (this.screenshotLoading) return reject(new Error('screenshot loading.'))

			let src = null
			if (typeof window.createObjectURL !== 'undefined') src = window.createObjectURL(fileObj)
			else if (typeof window.URL !== 'undefined') src = window.URL.createObjectURL(fileObj)
			else if (typeof window.webkitURL !== 'undefined') src = window.webkitURL.createObjectURL(fileObj)
			else return reject(new Error('Invalid file.'))

			this.screenshotLoading = true

			let canPlay = false

			let video = document.createElement('video')
			video.src = src
			video.muted = 'muted'
			video.autoplay = 'autoplay'
			video.currentTime = currentTime
			video.crossOrigin = 'anonymous'

			video.addEventListener('error', (error) => {
				reject(error)
				this.screenshotLoading = false
				video = null
			})

			video.addEventListener('canplay', () => {
				if (canPlay) return
				canPlay = true
				setTimeout(screenshot, 16.7)
			})

			const screenshot = () => {
				if (video.readyState < 2) {
					console.log('video screenshot...')
					setTimeout(screenshot, 16.7)
				} else {
					const canvas = document.createElement('canvas')
					canvas.width = video.videoWidth
					canvas.height = video.videoHeight
					const context = canvas.getContext('2d')
					context.drawImage(video, 0, 0, canvas.width, canvas.height)
					let data = canvas.toDataURL('image/jpg').split(',').pop()
					let name = fileObj.name.split('.')
					name.pop()
					resolve(new File([base64js.toByteArray(data)], name.join('.') + '.jpg', { mime: 'image/jpg' }))
					this.screenshotLoading = false
					video = null
				}
			}
		})
	},
	/**
	 * 是否为媒体文件（视频，音频）
	 *
	 * @param {File} file 文件
	 * @returns {Promise}
	 */
	isMediaFile(fileObj) {
		let type = mime.getType(fileObj.name)
		return type && (type.includes('video') || type.includes('audio'))
	},
	/**
	 * 是否为视频文件
	 *
	 * @param {File} fileObj 文件
	 * @returns {Promise}
	 */
	isVideoFile(fileObj) {
		return (mime.getType(fileObj.name) || '').includes('video')
	},
	/**
	 * 是否为音频文件
	 *
	 * @param {File} fileObj 文件
	 * @returns {Promise}
	 */
	isAudioFile(fileObj) {
		return (mime.getType(fileObj.name) || '').includes('audio')
	},
	/**
	 * 获取链接地址上的文件名
	 *
	 * @param {String} url 链接
	 * @returns {String}
	 */
	getFileName(url) {
		return Buffer.from(decodeURIComponent(url.split('/').pop().split('-').shift()), 'base64').toString()
	},
	/**
	 * 创建实例
	 *
	 * @param {Object} options
	 * @returns
	 */
	create(options) {
		return createAliOSSInstance(this.bucketAccessType, options)
	},
	/**
	 * 销毁正在进行中的任务
	 */
	destroy() {
		//关闭获取文件信息任务
		if (this.mediaInfoReader) this.mediaInfoReader.abort(), (this.mediaInfoReader = null)
		//关闭获取文件信息任务
		if (this.mediaInfoInstance) this.mediaInfoInstance.close(), (this.mediaInfoInstance = null)
		//取消所有任务
		this.cancel()
	},
	/**
	 * 简单上传（默认无回调）
	 * @link https://help.aliyun.com/document_detail/383950.html
	 *
	 * @param {String} filePath 文件路径
	 * @param {File} fileObj 文件对象
	 * @param {Object} options 参数
	 * @param {String} accessType 访问类型
	 * @returns {Promise}
	 */
	async simpleUpload(filePath, fileObj, options) {
		let path = combineFileDirectory(filePath, fileObj)
		let opts = combineUploadOptions(this.bucketAccessType, options)
		// console.log('####simpleUpload', this.options, opts)
		await this.put(path, fileObj, opts)
		let paths = path.split('/')
		let name = encodeURIComponent(paths.pop())
		paths.push(name)
		return this.options.domain + paths.join('/')
	},
	/**
	 * 分片上传（默认无回调）
	 * @link https://help.aliyun.com/document_detail/383952.html
	 *
	 * @param {String} filePath 文件路径
	 * @param {File} fileObj 文件对象
	 * @param {Object} options 参数
	 * @returns {Promise}
	 */
	async multipartUpload(filePath, fileObj, options) {
		let path = combineFileDirectory(filePath, fileObj)
		let opts = combineUploadOptions(this.bucketAccessType, options)
		// console.log('####multipartUpload', this.options, opts)
		return await this._multipartUpload(path, fileObj, opts)
	}
}

const extendAliOSSInstance = (target, dest) => {
	for (const key in dest) {
		if (target[key]) target[`_${key}`] = target[key]
		target[key] = typeof dest[key] === 'function' ? dest[key] : dest[key]
	}
}

const createAliOSSInstance = (accessType, aliossOptions) => {
	// Create new alioss instance
	const alioss = new AliOSS(defu(aliossOptions, pluginOptions[accessType]))

	// Create new alioss plugin
	const plugin = new AliOSSPlugin(accessType)

	// Extend alioss proto
	extendAliOSSInstance(alioss, plugin)

	return alioss
}

export default (ctx, inject) => {
	//public
	const alioss = createAliOSSInstance('public', pluginOptions.client)
	ctx.$alioss = alioss
	inject('alioss', alioss)
	//private
	const alvoss = createAliOSSInstance('private', pluginOptions.client)
	ctx.$alvoss = alvoss
	inject('alvoss', alvoss)
}
