/**
 * Worker Name: CloudFlare Image Resizing for Magento
 * Worker URI: https://github.com/Mecanik/cloudflare-image-resizing-magento
 * Description: This worker will replace Image URL's so you can use the CloudFlare Image Resizing service in Magento.
 * Version: 1.0
 * Author: Mecanik
 * Author URI: https://github.com/Mecanik/
 *
 * License: Apache License 2.0 (https://github.com/Mecanik/cloudflare-image-resizing-magento/blob/main/LICENSE)
 * Copyright (c) 2024 Mecanik
 **/

// Edit the below as needed
// START EDIT -----------------------------------------------------

// Set theme type
// 0 = Luma (Default Magento theme)
// 1 = Custom themes
const MAGENTO_THEME = 1;

// Speed: Set the image quality
const IMAGE_QUALITY = 90;

// Speed: Append lazy loading to images
const IMAGE_LAZY_LOAD = false;

// END EDIT -------------------------------------------------------
// DO NOT EDIT BELOW THIS LINE.

// Luma (Default Magento theme)
const SrcLuma = '(https?:\\/\\/(?:www\\.|(?!www))[^/]*)(\\/(?:media\\/|pub\\/media\\/).*?\\.(?:jpe?g|gif|png|webp|svg))(.*?)';
const rgxSrcLuma = new RegExp(`${SrcLuma}`, 'g');

// Custom themes (example paths, adjust as necessary)
const SrcCustom = '(https?:\\/\\/(?:www\\.|(?!www))[^/]*)(\\/(?:media\\/|pub\\/media\\/).*?\\.(?:jpe?g|gif|png|webp|svg))(.*?)';
const rgxSrcCustom = new RegExp(`${SrcCustom}`, 'g');

/**
 * Rewrites the <img> tags, including source sets, plugins like sliders, and more.
 * @version 1.0.0
 */
class ImageTagRewriter extends HTMLRewriter {
	async element(element) {
		// Base CDN
		let CDN = "/cdn-cgi/image/";
		let hasSizes = false;

		// Check if image has sizes set
		if (element.hasAttribute("width") && element.hasAttribute("height")) {
			const width = element.getAttribute("width");
			const height = element.getAttribute("height");

			if (width) {
				CDN += "width=" + width + ",";
			}
			if (height) {
				CDN += "height=" + height + ",";
			}
			if (width && height) hasSizes = true;
		}

		if (element.hasAttribute("src")) {
			if (hasSizes)
				CDN += `fit=crop,quality=${IMAGE_QUALITY},format=auto,onerror=redirect,metadata=none`;
			else
				CDN += `quality=${IMAGE_QUALITY},format=auto,onerror=redirect,metadata=none`;

			const src = element.getAttribute("src");

			// Ignore data/base64 images
			if (src && src.indexOf("base64") === -1) {
				if (src.indexOf('/cdn-cgi/image/') === -1) {
					let result;
					switch (MAGENTO_THEME) {
						case 0:
							result = src.replace(rgxSrcLuma, `$1${CDN}$2$3`);
							break;
						case 1:
							result = src.replace(rgxSrcCustom, `$1${CDN}$2$3`);
							break;
						default:
							break;
					}
					element.setAttribute("src", result);
				}
			}
		}
	}
}

/**
 * Rewrites the <li> tags, used to replace image sources for inline CSS (sliders and more)
 * @version 1.0.0
 */
class LiTagRewriter extends HTMLRewriter {
	async element(element) {
		if (element.hasAttribute("style")) {
			const style = element.getAttribute("style");
			if (style && style.indexOf('/cdn-cgi/image/') === -1) {
				const CDN = `/cdn-cgi/image/quality=${IMAGE_QUALITY},format=auto,onerror=redirect,metadata=none`;
				let result;
				switch (MAGENTO_THEME) {
					case 0:
						// Luma theme does not use this
						break;
					case 1:
						result = style.replace(rgxSrcCustom, `url('$1${CDN}$2$3')`);
						break;
					default:
						break;
				}
				element.setAttribute("style", result);
			}
		}
	}
}

/**
 * Entry point for worker in module syntax
 * @version 1.0.0
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* 1️⃣  Let Cloudflare resize if the path already starts with /cdn-cgi/image/ */
    if (url.pathname.startsWith('/cdn-cgi/image/')) {
      const idx = url.pathname.indexOf('http');
      if (idx === -1) return new Response('Missing origin image', { status: 400 });
      const originUrl = decodeURIComponent(url.pathname.substring(idx));
      return fetch(originUrl, request);
    }

    /* 2️⃣  Everything else stays the same */
    const originResponse = await fetch(request);
    if (!originResponse.ok || !originResponse.headers.get('content-type')?.includes('text/html')) {
      return originResponse;
    }

    /* 3️⃣  Remove the broken ScriptTagRewriter line */
    return new HTMLRewriter()
      .on('img', new ImageTagRewriter())
      .on('li', new LiTagRewriter())
      .transform(originResponse);
  }
}
