require('dotenv').config();
const path = require('path');
require('dotenv').config({path: path.join(__dirname, 'build.vars')});
const puppeteer = require('puppeteer');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.raw({inflate: true, type: ['text/html', 'text/plain']}));

let browser;
(async() => {
	browser = await puppeteer.launch({
		headless: true,
		ignoreHTTPSErrors: true,
		args: [
			'--ignore-certificate-errors',
			'--ignore-certificate-errors-spki-list',
		],
	});
	app.listen(process.env.PORT, () => {
		console.log(`Microservice pdf generator listening on ${process.env.PORT}`);
	});
})();

const authorize = (req, res, next) => {
	// Header with client address passed by nginx
	const original_ip = req.headers['x-forwarded-for'];
	// If there is no original_ip it means that request was sent via localhost (omitting nginx proxy)
	// In this way, we simply authorize scripts which will use this microservice (by requesting via localhost)
	return original_ip ? res.sendStatus(401) : next();
};

const generateFromHTML = async(html = '') => {
	let page;
	try {
		page = await browser.newPage();
		await page.setContent(html.toString(), {waitUntil: ['domcontentloaded', 'load', 'networkidle0']});
		await page.addStyleTag({
			content: `
			@media print {
				* {
					-webkit-print-color-adjust: exact !important;
					color: inherit !important;
					background: inherit !important;
				}
				
				.pagebreak { page-break-before: always; }

				a {
					color: #004e8c !important;
				}
			}
			`,
		});
		const pdfBuffer = await page.pdf({
			scale: 0.7,
			printBackground: true,
			margin: {
				top: '30px',
				bottom: '30px',
				right: '30px',
				left: '30px',
			},
			displayHeaderFooter: true,
			headerTemplate: '',
			footerTemplate: `
			<div style="width: 100%; font-size: 9px;
				padding: 12px 5px 0; color: #bbb; position: relative;">
				<div style="position: absolute; right: 15px; top: 5px;"><span class="pageNumber"></span> of <span class="totalPages"></span></div>
			</div>`,
		});
		return pdfBuffer;
	} catch (error) {
		console.error('Something went wrong while generating pdf: \n', error);
		await page.close();
	} finally {
		await page.close();
	}
	return pdfBuffer;
};

app.post('/', authorize, async(req, res) => {
	const {body} = req;
	if (!Buffer.isBuffer(body)) {
		return res.status(204).end();
	}
	const pdfContent = await generateFromHTML(body);
	res.contentType('application/pdf');
	res.send(pdfContent);
});

app.get('/buildversion', function(req, res, next) {
	res.setHeader('Content-Type', 'application/json');
	res.send({
		version: process.env.npm_package_version,
		build_date: process.env.BUILD_DATE,
		commit: process.env.COMMIT_TAG,
	});
});

//how to use in node

//const set_options_for_pdf_generator = function(html_source) {
//	const regex = new RegExp(ACCOUNT_APP_URL, 'g');
//	return {
//		method: 'POST',
//		url: `http://localhost:${PDFGEN_PORT}`,
//		headers: {
//			'content-type': 'text/html',
//		},
//		body: html_source.replace(regex, PDFGEN_URL),
//	};
//};

//res.setHeader('Content-type', 'application/pdf');
//res.setHeader('Content-disposition', `attachment; filename=${data.filename}`);
//const options = set_options_for_pdf_generator(data.html);
//request(options)
//    .pipe(res);