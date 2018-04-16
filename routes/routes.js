var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var crypto = require('crypto');
var fs = require('fs');
var mime = require('mime');

var connection = mysql.createConnection({
	host: 'localhost',
	user: 'root',
	password: '',
	database: 'genesiskyc'
});

var obcUrl = 'http://localhost:5100/bcsgw/rest/v1/transaction/invocation';
var obcRequest = {
	channel: 'kycaccess',
	chaincode: 'genesiskyc',
	chaincodeVer: 'v1.1.5'
};


// Add headers
router.use(function (req, res, next) {

	// Website you wish to allow to connect
	res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');

	// Request methods you wish to allow
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

	// Request headers you wish to allow
	res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

	// Set to true if you need the website to include cookies in the requests sent
	// to the API (e.g. in case you use sessions)
	res.setHeader('Access-Control-Allow-Credentials', true);

	// Pass to next layer of middleware
	next();
});

/* Index Page */
router.get('/', function (request, response) {
	response.json({status: 200, response: 'Welcome'});
});

/* Register user */
router.post('/register', function (request, response) {
	var password = crypto.createHash('sha256').update(request.body.password).digest('hex');
	var verificationToken = crypto.createHash('sha256').update((new Date().getTime()).toString()).digest('hex');
	var authToken = crypto.createHash('sha256').update(request.body.email).digest('hex');
	var parameters = [request.body.firstName, request.body.middleName, request.body.lastName, request.body.email, password, verificationToken, authToken];
	var insertStmt = 'INSERT INTO customers (firstName, middleName, lastName, email, password, verificationToken, authToken)' +
		' VALUES(?, ?, ?, ?, ?, ?, ?)';
	insertStmt = mysql.format(insertStmt, parameters);
	connection.query(insertStmt, function (error, results) {
		if (error) {
			console.log(error);
			response.json({status: 500, error: 'User already registered', response: null})
		} else {
			response.json({status: 200, error: null, response: 'Registered Successfully'})
		}
	});
});

/* Login user account */
router.post('/login', function (request, response) {
	var password = crypto.createHash('sha256').update(request.body.password).digest('hex');
	var parameters = [request.body.email, password];
	console.log(parameters);
	var query = 'SELECT * FROM customers WHERE email = ? AND password = ?';
	query = mysql.format(query, parameters);
	connection.query(query, function (error, results) {
		console.log(results);
		console.log(error);
		if (error || results.length === 0) {
			response.json({status: 500, error: 'Email password combination incorrect', response: null})
		} else {
			var customer = results[0];
			if(customer.status !== 'active') {
				response.json({status: 500, error: 'Your account is not active', response: null})
			} else {
				delete customer.password;
				delete customer.verificationToken;
				response.json({status: 200, error: null, response: 'Logged in successfully', customer: customer})
			}
		}
	});
});

/* File upload */
router.post('/upload', function(request, response) {
	var formidable = require('formidable');
	var form = formidable.IncomingForm();
	form.parse(request, function(err, fields, files) {
		var file = files.file;
		var parameters = [fields.customer_id, file.name, fs.readFileSync(file.path)];
		var insertStmt = 'INSERT INTO documents (customer_id, name, content) VALUES (?, ?, ?)';
		insertStmt = mysql.format(insertStmt, parameters);
		connection.query(insertStmt, function (error, results) {
			if (error) {
				console.log(error);
				response.json({status: 500, error: 'Cannot store file', response: null})
			} else {
				response.json({status: 200, error: null, response: results.insertId})
			}
		});
	});
});

/* File Get */
router.get('/read', function(request, response) {
	var parameters = [request.query.id, request.query.customer_id];
	var query = 'SELECT * FROM documents WHERE id = ? AND customer_id = ?';
	query = mysql.format(query, parameters);
	connection.query(query, function (error, results) {
		if (error || results.length === 0) {
			response.json({status: 404, error: 'Not Found', response: null})
		} else {
			var result = results[0];
			response.setHeader('Content-disposition', 'inline; filename="' + result.name + '"')
			response.setHeader('Content-Type', mime.lookup(result.name));
			response.send(results[0].content);
		}
	});
});

router.post('/execute', function(request, response) {
	var exec = require('child_process').exec;
	request.body.args.unshift(request.body.method);
	var args = JSON.stringify({Args: request.body.args});
	console.log(args);
	var command = 'docker exec cli peer chaincode invoke -n genesiskyc -c \'' + args + '\' -C myc';
	console.log(command);
	exec(command, function(error, stdout, stderr) {
		var re = /Chaincode invoke successful. result: status:200 payload:(.*)/;
		var matches = stderr.match(re);
		var output = {};
		if(matches !== null && matches.length >= 2) {
			output = {returnCode: "Success", info: null, result: JSON.parse(matches[1])};
		} else {
			output = {returnCode: "Success", info: "Error occurrecd"};
		}
		response.json(output);
	});
});

router.post('/proxy', function(req, res) {
	var request = require('request');
	var options = {
		url: req.body.url,
		method: 'POST'
	};
	delete req.body.url;

	options.json = req.body;
	request.post(options).on('response', function(a) {
	}).pipe(res);
});

module.exports = router;
