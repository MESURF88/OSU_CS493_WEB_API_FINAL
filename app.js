const express = require('express');
const app = express();

const json2html = require('json-to-html');

const {Datastore} = require('@google-cloud/datastore');

const bodyParser = require('body-parser');
const request = require('request');
const jwtDecode = require('jwt-decode');
const path = require(`path`);

const datastore = new Datastore();

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const USER = "User";
const HOUSE = "House";
const DOG = "Dog";

const LIMIT = 5;

const router = express.Router();
const login = express.Router();

const CLIENT_ID = '########';
const CLIENT_SECRET = '##########';
const DOMAIN = 'wordswordswords';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

var h_name = "";
var removal = "";

function fromDatastore(item){
    item.id = item[Datastore.KEY].id;
    return item;
}

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${DOMAIN}/.well-known/jwks.json`

    }),

    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
  });


/* ------------- Begin User Model Functions ------------- */
function post_user(email, sub_id, homes){
    var key = datastore.key(USER);
	const new_user = {"email": email, "sub_id": sub_id, "homes": homes};
	return datastore.save({"key":key, "data":new_user}).then(() => {return key});
}

function get_users(){
	const q = datastore.createQuery(USER);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore);
		});
}

function get_users_sub(owner){
	const q = datastore.createQuery(USER);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore).filter( item => item.sub_id === owner );
		});
}

function user_elim_house(sub_id, h_id){
  const house_id = h_id;
  const user_sub = get_users_sub(sub_id)
  .then( (user_sub) => {
    const key = datastore.key([USER, parseInt(user_sub[0].id,10)]);
    const transaction = datastore.transaction();
      return transaction.run()
        .then(() => transaction.get(key))
        .then((result) => {
          const user = result[0];
          for (let z = 0; z < Object.keys(user.homes).length; z++){
              if (user.homes[z].id === parseInt(house_id,10)){
                user.homes.splice(z, 1);
                removal = "remove";
              }
          }
          transaction.save(
            {
              key: key,
              data: user
            }
          );
          return transaction.commit();
        })
        .catch(() => transaction.rollback());
  });
}

function assign_house(h_id, sub_id){
  const user_sub = get_users_sub(sub_id)
  .then( (user_sub) => {
      const key_u = datastore.key([USER, parseInt(user_sub[0].id,10)]);
      return datastore.get(key_u).then( (user) => {
        if (user[0] === undefined){
           user.Error = "No house with this house_id";
           return user;
        }
        else {
          var obj = {};
          obj.email = user[0].email;
          obj.sub_id = user[0].sub_id;
          obj.homes = user[0].homes;
          var element = {
              "id": parseInt(h_id,10)
          };
          obj.homes.push(element);
            const key_save = datastore.key([USER,parseInt(user_sub[0].id,10)]);
              const new_user = {"email": obj.email, "sub_id": obj.sub_id, "homes": obj.homes};
              return datastore.save({"key":key_save, "data":new_user}).then(() => {return key_save});
        }
      });
    });
};

/* ------------- Begin House Model Functions ------------- */
function post_house(name, type, footage, owner, dogs){
    var key = datastore.key(HOUSE);
	const new_house = {"name": name, "type": type, "footage": footage, "owner": owner, "dogs": dogs};
	return datastore.save({"key":key, "data":new_house}).then(() => {return  [key, new_house]});
}

function get_houses(owner, limit, offset){
	const q = datastore.createQuery(HOUSE).limit(parseInt(limit,10)).offset(parseInt(offset,10));
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore).filter( item => item.owner === owner );
		});
}

function get_houses_nolimit(owner){
	const q = datastore.createQuery(HOUSE);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore).filter( item => item.owner === owner );
		});
}

function get_houses_total(){
	const q = datastore.createQuery(HOUSE);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore);
		});
}

function get_house(h_id){
  const key = datastore.key([HOUSE, parseInt(h_id,10)]);
  return datastore.get(key);
}

function delete_house(h_id){
    const key = datastore.key([HOUSE, parseInt(h_id,10)]);
    return datastore.delete(key);
}

function house_elim_dog(h_id, d_id){
    const key = datastore.key([HOUSE, parseInt(h_id,10)]);
    const transaction = datastore.transaction();
      return transaction.run()
        .then(() => transaction.get(key))
        .then((result) => {
          const house = result[0];
          for (let z = 0; z < Object.keys(house.dogs).length; z++){
              if (((house.dogs[z].id).toString()).localeCompare(d_id) === 0){
                house.dogs.splice(z, 1);
                removal = "remove";
              }
          }
          transaction.save(
            {
              key: key,
              data: house
            }
          );
          return transaction.commit();
        })
        .catch(() => transaction.rollback());
}

function patch_house(h_id, house_name, house_type, house_footage){
      const key_h = datastore.key([HOUSE, parseInt(h_id,10)]);
      return datastore.get(key_h).then( (house) => {
          var obj = {};
          obj.name = house[0].name;
          obj.type = house[0].type;
          obj.footage = house[0].footage;
          obj.dogs = house[0].dogs;
          obj.owner = house[0].owner;
          if (house_name != undefined){
            patch_in_house_name(h_id, house_name);
            obj.name = house_name;
          }
          if (house_type != undefined){
            patch_in_house_type(h_id, house_type);
            obj.type = house_type;
          }
          if (house_footage != undefined){
            patch_in_house_footage(h_id, house_footage);
            obj.footage = house_footage;
          }

          const key_save = datastore.key([HOUSE,parseInt(h_id,10)]);
            const new_house = {"name": obj.name, "type": obj.type, "footage": obj.footage, "dogs": obj.dogs, "owner": obj.owner};
            return datastore.save({"key":key_save, "data":new_house}).then(() => {return [key_save, new_house]});
      });
}

function patch_in_house_name(h_id, house_name){
  const key = datastore.key([HOUSE, parseInt(h_id,10)]);
  const transaction = datastore.transaction();
    return transaction.run()
      .then(() => transaction.get(key))
      .then((result_h) => {
        const house_mod = result_h[0];
        house_mod.name = house_name;
        transaction.save(
          {
            key: key,
            data: house_mod
          }
        );
        return transaction.commit();
      })
     .catch(() => transaction.rollback());
}

function patch_in_house_type(h_id, house_type){
  const key = datastore.key([HOUSE, parseInt(h_id,10)]);
  const transaction = datastore.transaction();
    return transaction.run()
      .then(() => transaction.get(key))
      .then((result_h) => {
        const house_mod = result_h[0];
        house_mod.type = house_type;
        transaction.save(
          {
            key: key,
            data: house_mod
          }
        );
        return transaction.commit();
      })
     .catch(() => transaction.rollback());
}

function patch_in_house_footage(b_id, house_footage){
  const key = datastore.key([HOUSE, parseInt(h_id,10)]);
  const transaction = datastore.transaction();
    return transaction.run()
      .then(() => transaction.get(key))
      .then((result_h) => {
        const house_mod = result_h[0];
        house_mod.footage = house_footage;
        transaction.save(
          {
            key: key,
            data: house_mod
          }
        );
        return transaction.commit();
      })
     .catch(() => transaction.rollback());
}

function put_house(id, name, type, footage){
  const key_h = datastore.key([HOUSE, parseInt(id,10)]);
  return datastore.get(key_h).then( (house) => {
    var obj = {};
    obj.owner = house[0].owner;
    obj.dogs = house[0].dogs;
    if (name === undefined){
      name = null;
    }
    if (type === undefined){
      type = null;
    }
    if (footage === undefined){
      footage = null;
    }
      const key = datastore.key([HOUSE, parseInt(id,10)]);
      const new_house = {"name": name, "type": type, "footage": footage, "dogs": obj.dogs, "owner": obj.owner};
      return datastore.save({"key":key, "data":new_house}).then(() => {return [key, new_house]});
  });
}

/* ------------- Begin Dogs Model Functions ------------- */
function post_dog(name, type, age, home){
    var key = datastore.key(DOG);
	const new_dog = {"name": name, "type": type, "age": age, "home": home};
	return datastore.save({"key":key, "data":new_dog}).then(() => {return  [key, new_dog]});
}

function get_dogs(limit, offset){
	const q = datastore.createQuery(DOG).limit(parseInt(limit,10)).offset(parseInt(offset,10));
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore);
		});
}

function get_dogs_nolimit(){
	const q = datastore.createQuery(DOG);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(fromDatastore);
		});
}

function get_dog(d_id){
  const key = datastore.key([DOG, parseInt(d_id,10)]);
  return datastore.get(key);
}

function delete_dog(d_id){
    const key = datastore.key([DOG, parseInt(d_id,10)]);
    return datastore.delete(key);
}

function patch_dog(d_id, dog_name, dog_type, dog_age){
      const key_d = datastore.key([DOG, parseInt(d_id,10)]);
      return datastore.get(key_d).then( (dog) => {
          var obj = {};
          obj.name = dog[0].name;
          obj.type = dog[0].type;
          obj.age = dog[0].age;
          obj.home = dog[0].home;
          if (dog_name != undefined){
            patch_in_dog_name(d_id, dog_name);
            obj.name = house_name;
          }
          if (dog_type != undefined){
            patch_in_dog_type(d_id, dog_type);
            obj.type = dog_type;
          }
          if (dog_age != undefined){
            patch_in_dog_age(d_id, dog_age);
            obj.age = dog_age;
          }

          const key_save = datastore.key([DOG, parseInt(d_id,10)]);
            const new_dog = {"name": obj.name, "type": obj.type, "age": obj.age, "home": obj.home};
            return datastore.save({"key":key_save, "data":new_dog}).then(() => {return [key_save, new_dog]});
      });
}

function patch_in_dog_name(d_id, dog_name){
  const key = datastore.key([DOG, parseInt(d_id,10)]);
  const transaction = datastore.transaction();
    return transaction.run()
      .then(() => transaction.get(key))
      .then((result_d) => {
        const dog_mod = result_d[0];
        dog_mod.name = dog_name;
        transaction.save(
          {
            key: key,
            data: dog_mod
          }
        );
        return transaction.commit();
      })
     .catch(() => transaction.rollback());
}

function patch_in_dog_type(d_id, dog_type){
  const key = datastore.key([DOG, parseInt(d_id,10)]);
  const transaction = datastore.transaction();
    return transaction.run()
      .then(() => transaction.get(key))
      .then((result_d) => {
        const dog_mod = result_d[0];
        dog_mod.type = dog_type;
        transaction.save(
          {
            key: key,
            data: dog_mod
          }
        );
        return transaction.commit();
      })
     .catch(() => transaction.rollback());
}

function patch_in_dog_age(d_id, dog_age){
  const key = datastore.key([DOG, parseInt(d_id,10)]);
  const transaction = datastore.transaction();
    return transaction.run()
      .then(() => transaction.get(key))
      .then((result_d) => {
        const dog_mod = result_d[0];
        dog_mod.age = dog_age;
        transaction.save(
          {
            key: key,
            data: dog_mod
          }
        );
        return transaction.commit();
      })
     .catch(() => transaction.rollback());
}

function put_dog(id, name, type, age){
  const key_d = datastore.key([DOG, parseInt(id,10)]);
  return datastore.get(key_d).then( (dog) => {
    var obj = {};
    obj.home = dog[0].home;
    if (name === undefined){
      name = null;
    }
    if (type === undefined){
      type = null;
    }
    if (age === undefined){
      age = null;
    }
      const key = datastore.key([DOG, parseInt(id,10)]);
      const new_dog = {"name": name, "type": type, "age": age, "home": obj.home};
      return datastore.save({"key":key, "data":new_dog}).then(() => {return [key, new_dog]});
  });
}

function put_out_dog(d_id){
  console.log("unassign");
  //modify dog
  const key = datastore.key([DOG, parseInt(d_id,10)]);
  const transaction = datastore.transaction();
    return transaction.run()
      .then(() => transaction.get(key))
      .then((result_d) => {
        const dog_mod = result_d[0];
        dog_mod.home.id = null;
        dog_mod.home.name = null;

        transaction.save(
          {
            key: key,
            data: dog_mod
          }
        );

        return transaction.commit();
      })
     .catch(() => transaction.rollback());
}

function put_in_dog(d_id, h_id, h_name){
  console.log("assign");
  //modify dog
  const key = datastore.key([DOG, parseInt(d_id,10)]);
  const transaction = datastore.transaction();
    return transaction.run()
      .then(() => transaction.get(key))
      .then((result_d) => {
        const dog_mod = result_d[0];
        dog_mod.home.id = parseInt(h_id,10);
        dog_mod.home.name = h_name;
        transaction.save(
          {
            key: key,
            data: dog_mod
          }
        );

        return transaction.commit();
      })
     .catch(() => transaction.rollback());
}

function assign_dog(d_id, h_id){
  const key = datastore.key([DOG, parseInt(d_id,10)]);
  return datastore.get(key).then( (dog) => {
    if (dog[0] === undefined){
       dog.Error = "No dog with that dog_id";
       return dog;
    }
    else if(dog[0].home.id != null){
        dog.Error = "dog already on another house, remove it first";
        return dog;
    }
    else{
      const key_h = datastore.key([HOUSE, parseInt(h_id,10)]);
      return datastore.get(key_h).then( (house) => {
        if (house[0] === undefined){
           house.Error = "No house with this house_id";
           return house;
        }
        else {
          var obj = {};
          obj.name = house[0].name;
          obj.type = house[0].type;
          obj.footage = house[0].footage;
          obj.owner = house[0].owner;
          obj.dogs = house[0].dogs;
          h_name = house[0].name;
          var element = {
              "id": parseInt(d_id,10)
          };
          obj.dogs.push(element);

            put_in_dog(d_id, h_id, h_name);
            const key_save = datastore.key([HOUSE,parseInt(h_id,10)]);
            const new_house = {"name": obj.name, "type": obj.type, "footage": obj.footage, "owner": obj.owner, "dogs": obj.dogs};
            return datastore.save({"key":key_save, "data":new_house}).then(() => {return key_save});
            return house;

        }
      })
    }
  });
};

function unassign_dog(h_id, d_id){
  removal = null;
  var house_exists = 1;
  const key = datastore.key([DOG, parseInt(d_id,10)]);
  return datastore.get(key).then( (dog) => {
    if (dog[0] === undefined){
       dog.Error = "No dog with that dog_id";
       return dog;
    }
    else if(dog[0].home.id == null){
        dog.Error = "dog not assigned to house yet";
        return dog;
    }
    if(dog[0].home.id !== parseInt(h_id,10)){
      house_exists = 0;
      dog.Error = "dog not assigned to that house";
      return dog;
    }
    else{
      const key_h = datastore.key([HOUSE, parseInt(h_id,10)]);
      return datastore.get(key_h).then( (house) => {
        if (house[0] === undefined){
            house.Error = "No house with that house_id";
            return house;
        }
        else {
          //modify house first
            house_elim_dog(h_id, d_id)
            .then(put_out_dog(d_id));
            return house;
        }

      });
    }
  });
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

//gui for adding jwt email and password
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/views/welcome.html'));
});

app.post('/user_new', (req, responsehtml) => {
  const signup_email = req.body.email_val
  const signup_pass = req.body.pass_val

request.post(
 'https://dev-ajsoscoe.auth0.com/dbconnections/signup',
 {
   form: {
     client_id: "mC5Yq78Tri81XCtXBYAkHoCsTjdDsi6e",
     email: signup_email,
     password: signup_pass,
     connection: "Username-Password-Authentication",
   }
 },
 (error, res, body) => {
   if (error) {
     console.error(error);
     return;
   }
   console.log(`statusCode: ${res.statusCode}`);

   var body_val = JSON.parse(body);
   console.log(body_val);
   var jwt_token = "";
   if (body_val.code === 'invalid_signup'){
     jwt_token = "Error! email already used, bad signup"
     var styling = '<style> body { font-family: \'Roboto\', sans-serif; background: #f64f59;  background: -webkit-linear-gradient(to bottom, #007f60, #449900, #40f900); background: linear-gradient(to bottom, #007f60, #449900, #40f900);min-height: 100vh; width: 100vw; margin: 0;}  </style>';
     responsehtml.send('<!DOCTYPE html><html><head><title>JWT APP</title>'+styling+'</head><body><h2>User Info below is the email and JWT</h2><h4>The data below is from Auth0 with the email, JWT and sub</h4><li>email: '+signup_email+'</li><li>Error: '+jwt_token+'</li></body> </html>');

   }
   else if(body_val.code === 'invalid_password'){
     jwt_token = "Error! password is too weak"
     var styling = '<style> body { font-family: \'Roboto\', sans-serif; background: #f64f59;  background: -webkit-linear-gradient(to bottom, #007f60, #449900, #40f900); background: linear-gradient(to bottom, #007f60, #449900, #40f900);min-height: 100vh; width: 100vw; margin: 0;}  </style>';
     responsehtml.send('<!DOCTYPE html><html><head><title>JWT APP</title>'+styling+'</head><body><h2>User Info below is the email and JWT</h2><h4>The data below is from Auth0 with the email, JWT and sub</h4><li>email: '+signup_email+'</li><li>Error: '+jwt_token+'</li></body> </html>');

   }
   else{
     var options = { method: 'POST',
             url: `https://${DOMAIN}/oauth/token`,
             headers: { 'content-type': 'application/json' },
             body:
              { grant_type: 'password',
                username: signup_email,
                password: signup_pass,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET },
             json: true };
     request(options, (error, response, body) => {
         if (error){
             res.status(500).send(error);
         } else {
             var homes = [];
             var obj = {};
             //output sub property in response
             obj = body.id_token;
             body.sub = jwtDecode(obj).sub
             console.log(body);
             jwt_token = body.id_token;
             //put user information in datastore
             post_user(signup_email, body.sub, homes);
             var styling = '<style> body { font-family: \'Roboto\', sans-serif; background: #f64f59;  background: -webkit-linear-gradient(to bottom, #007f60, #449900, #40f900); background: linear-gradient(to bottom, #007f60, #449900, #40f900);min-height: 100vh; width: 100vw; margin: 0;}  </style>';
             responsehtml.send('<!DOCTYPE html><html><head><title>JWT APP</title>'+styling+'</head><body><h2>User Info below is the email and JWT</h2><h4>The data below is from Auth0 with the email, JWT and sub</h4><li>email: '+signup_email+'</li><li>jwt: <textarea>'+jwt_token+'</textarea></li><li>sub id: '+body.sub+'</li></body> </html>');

         }
     });
   }
 })
});

//gui for logging in with jwt email and password
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '/views/login.html'));
});

app.post('/user_current', (req, responsehtml) => {
  const login_email = req.body.email_val
  const login_pass = req.body.pass_val
  var options = { method: 'POST',
          url: `https://${DOMAIN}/oauth/token`,
          headers: { 'content-type': 'application/json' },
          body:
           { grant_type: 'password',
             username: login_email,
             password: login_pass,
             client_id: CLIENT_ID,
             client_secret: CLIENT_SECRET },
          json: true };
  request(options, (error, response, body) => {
      if (error){
          res.status(500).send(error);
      } else {
        //output sub property in response
        obj = body.id_token;
        body.sub = jwtDecode(obj).sub
        console.log(body);
        jwt_token = body.id_token;
        var styling = '<style> body { font-family: \'Roboto\', sans-serif; background: #f64f59;  background: -webkit-linear-gradient(to bottom, #007f60, #449900, #40f900); background: linear-gradient(to bottom, #007f60, #449900, #40f900);min-height: 100vh; width: 100vw; margin: 0;}  </style>';
        responsehtml.send('<!DOCTYPE html><html><head><title>JWT APP</title>'+styling+'</head><body><h2>User Info below is the email, JWT and sub</h2><h4>The data below is from Auth0 with the email and JWT</h4><li>email: '+login_email+'</li><li>jwt: <textarea>'+jwt_token+'</textarea></li><li>sub id: '+body.sub+'</li></body> </html>');

      }
  });
});

//Endpoints for viewing users
router.get('/users', function(req, res){
    const user_obj = get_users()
	  .then( (user_obj) => {
      var obj = {};
      const accepts = req.accepts('application/json');
      if(!accepts){
        obj = {};
        obj.Error = "Not Acceptable";
        res.status(406).json(obj);
      } else if(accepts === 'application/json'){
        res.status(200).json(user_obj);
      }
      else{
        obj = {};
        obj.Error = "Content type got messed up!";
        res.status(500).json(obj);
      }
    });
});

//Endpoints for adding houses and viewing houses
//Read all houses
router.get('/houses', checkJwt, function(req, res){
  var owner = jwtDecode(req.headers.authorization).sub
  const houses = get_houses(owner, LIMIT, req.query.offset)
	.then( (houses) => {
    var obj = {};
    const accepts = req.accepts('application/json');
    if(!accepts){
      obj = {};
      obj.Error = "Not Acceptable";
      res.status(406).json(obj);
    } else if(accepts === 'application/json'){
      for (let i = 0; i < Object.keys(houses).length; i++){
        houses[i].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + houses[i].id;
        for (let j = 0; j < Object.keys(houses[i].dogs).length; j++){
          houses[i].dogs[j].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + houses[i].dogs[j].id;
        }
      }
      if ( req.query.offset === undefined){
        var offset_val = 0;
      }
      else{
        var offset_val = parseInt(req.query.offset,10);
      }
      //get total houses from datastore
      const total_houses = get_houses_total()
      .then( (total_houses) => {
          var count = Object.keys(total_houses).length;
          if ( req.query.offset === undefined){
            var offset_val = 0;
            var add = 5;
          }
          else{
            var offset_val = parseInt(req.query.offset,10);
            var add = 5;
          }
          if ((count) > (LIMIT + offset_val)){
              var link = { "next" : req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/?limit='+LIMIT+'&offset='+(parseInt(offset_val,10) + add)};
              houses.push(link);
          }
          var count_obj = { "total_count" : count};
          houses.push(count_obj);
          res.status(200).json(houses);
      });
    }
    else{
      obj = {};
      obj.Error = "Content type got messed up!";
      res.status(500).json(obj);
    }
    });
});

//Read one house
router.get('/houses/:id', checkJwt, function(req, res){
  var owner = jwtDecode(req.headers.authorization).sub
  const exists = get_house(req.params.id)
  .then( (exists) => {
    if (exists[0] === undefined){
        var obj ={};
        obj.Error = "No house with that house_id";
        res.status(404).json(obj);
    }
    else{
      const houses = get_houses_nolimit(owner)
      .then( (houses) => {
        const accepts = req.accepts(['application/json']);
       if(!accepts){
          var obj = {};
          obj.Error = "Not Acceptable";
          res.status(406).json(obj);
        } else if(accepts === 'application/json'){
        var found = 0;
        var valid_owner = 0;
        for (let i = 0; i < Object.keys(houses).length; i++){
            if ((houses[i].id).localeCompare(req.params.id) === 0){
              found = 1;
              if((owner).localeCompare(houses[i].owner) === 0){
                valid_owner = 1;
              }
            }
        }
          if (valid_owner === 0){//valid jwt but doesn't match sub
            var obj = {};
            obj.Error = "valid jwt but doesn't match the owner of house";
            return res.status(403).json(obj);
          }
          else{
            const house = get_house(req.params.id)
            .then( (house) => {
                if (house[0] === undefined){
                  var obj = {};
                  obj.Error = "No house with that house_id";
                  return res.status(404).json(obj);
                }
                else{
                  house[0].id = req.params.id;
                  house[0].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + req.params.id;
                  for (let j = 0; j < Object.keys(house[0].dogs).length; j++){
                    house[0].dogs[j].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + house[0].dogs[j].id;
                  }
                  return res.status(200).json(house[0]);
                }
              });
            }
          }
      });
    }
  });
});

//Create house
router.post('/houses', checkJwt, function(req, res){
    //correct body content (json)
    if(req.get('content-type') !== 'application/json'){
      var obj ={};
      obj.Error = "Server only accepts application/json data.";
      res.status(415).json(obj);
    }
    else{
      //correct body response (json)
      const accepts = req.accepts(['application/json']);
        if(!accepts){
          var obj ={};
          obj.Error = "Not Acceptable";
          res.status(406).json(obj);
        }
        else if(accepts === 'application/json'){
          if (req.body.name != null && req.body.type != null && req.body.footage != null){
            var dogs = req.body.dogs;
            if (req.body.dogs == null){
              dogs = [];
            }
            else{
              dogs = [];
            }
            var owner = jwtDecode(req.headers.authorization).sub
              post_house(req.body.name, req.body.type, req.body.footage, owner, dogs)
              .then( phouse => {
                if (phouse[0] === undefined){
                  var obj = {};
                  obj.Error = "The request object is missing at least one of the required attributes";
                  res.status(400).json(obj);
                }
                  assign_house(phouse[0].id, owner);
                  res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + phouse[0].id);
                  phouse[1].id = phouse[0].id;
                  phouse[1].self = req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + phouse[0].id;
                  res.status(201).json(phouse[1]);
              });
            }
            else{
              obj ={};
              obj.Error = "The request object is missing at least one of the required attributes";
              res.status(400).json(obj);
            }
          }
        }
});

//Delete house
router.delete('/houses/:id', checkJwt, function(req, res){
  var owner = jwtDecode(req.headers.authorization).sub
  const house = get_house(req.params.id)
  .then( (house) => {
      if (house[0] === undefined){
        var obj = {};
        obj.Error = "No house with that house_id";
        return res.status(404).json(obj);
      }
      else{
      const houses = get_houses_nolimit(owner)
      .then( (houses) => {
        const accepts = req.accepts(['application/json']);
       if(!accepts){
          var obj = {};
          obj.Error = "Not Acceptable";
          res.status(406).json(obj);
        } else if(accepts === 'application/json'){
        var found = 0;
        var valid_owner = 0;
        for (let i = 0; i < Object.keys(houses).length; i++){
            if ((houses[i].id).localeCompare(req.params.id) === 0){
              found = 1;
              if((owner).localeCompare(houses[i].owner) === 0){
                valid_owner = 1;
              }
            }
        }
          if(valid_owner === 0){//valid jwt but doesn't match sub
            var obj = {};
            obj.Error = "valid jwt but doesn't match the owner of house";
            return res.status(403).json(obj);
          }
          else{
            const house_one = get_house(req.params.id)
            .then( (house_one) => {
                if (house_one[0] === undefined){
                  var obj = {};
                  obj.Error = "No house with that house_id";
                  return res.status(404).json(obj);
                }
                else{
                   user_elim_house(house_one[0].owner, req.params.id);
                    //unassign dogs from the house
                    for (let j = 0; j < Object.keys(house_one[0].dogs).length; j++){
                      put_out_dog(house_one[0].dogs[j].id);
                    }
                    //remove house
                    delete_house(req.params.id).then(res.status(204).end());
                }
              });
            }
        }
      });
    }
  });
});

//Update patch house
router.patch('/houses/:id', checkJwt, function(req, res){
  const exists = get_house(req.params.id)
  .then( (exists) => {
    if (exists[0] === undefined){
        var obj ={};
        obj.Error = "No house with that house_id";
        res.status(404).json(obj);
    }
    else{
      //correct body content (json)
      if(req.get('content-type') !== 'application/json'){
        var obj ={};
        obj.Error = "Server only accepts application/json data.";
        res.status(415).json(obj);
      }
      else{
       //correct body response (json)
       const accepts = req.accepts(['application/json']);
       if(!accepts){
          var obj = {};
          obj.Error = "Not Acceptable";
          res.status(406).json(obj);
        } else if(accepts === 'application/json'){
          var owner = jwtDecode(req.headers.authorization).sub;
          const houses = get_houses_nolimit(owner)
          .then( (houses) => {
            var found = 0;
            var valid_owner = 0;
            for (let i = 0; i < Object.keys(houses).length; i++){
                if ((houses[i].id).localeCompare(req.params.id) === 0){
                  found = 1;
                  if((owner).localeCompare(houses[i].owner) === 0){
                    valid_owner = 1;
                  }
                }
            }
              if (valid_owner === 0){//valid jwt but doesn't match sub
                var obj = {};
                obj.Error = "valid jwt but doesn't match the owner of house";
                return res.status(403).json(obj);
              }
              else{
                const h = patch_house(req.params.id, req.body.name, req.body.type, req.body.footage)
                .then( (h) => {
                    h[1].id = h[0].id;
                    h[1].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + h[0].id;
                    for (let j = 0; j < Object.keys(h[1].dogs).length; j++){
                      h[1].dogs[j].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + h[1].dogs[j].id;
                    }
                    return res.status(200).json(h[1]);
                  });
                }
          });
        }
      }
    }
  });
});

//Update put house
router.put('/houses/:id', checkJwt, function(req, res){
  const exists = get_house(req.params.id)
  .then( (exists) => {
    if (exists[0] === undefined){
        var obj ={};
        obj.Error = "No house with that house_id";
        res.status(404).json(obj);
    }
    else{
      //correct body content (json)
      if(req.get('content-type') !== 'application/json'){
        var obj ={};
        obj.Error = "Server only accepts application/json data.";
        res.status(415).json(obj);
      }
      else{
       //correct body response (json)
       const accepts = req.accepts(['application/json']);
       if(!accepts){
          var obj = {};
          obj.Error = "Not Acceptable";
          res.status(406).json(obj);
        } else if(accepts === 'application/json'){
          var owner = jwtDecode(req.headers.authorization).sub;
          const houses = get_houses_nolimit(owner)
          .then( (houses) => {
            var found = 0;
            var valid_owner = 0;
            for (let i = 0; i < Object.keys(houses).length; i++){
                if ((houses[i].id).localeCompare(req.params.id) === 0){
                  found = 1;
                  if((owner).localeCompare(houses[i].owner) === 0){
                    valid_owner = 1;
                  }
                }
            }
              if (valid_owner === 0){//valid jwt but doesn't match sub
                var obj = {};
                obj.Error = "valid jwt but doesn't match the owner of house";
                return res.status(403).json(obj);
              }
              else{
                const h = put_house(req.params.id, req.body.name, req.body.type, req.body.footage)
                .then( (h) => {
                    h[1].id = h[0].id;
                    h[1].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + h[0].id;
                    for (let j = 0; j < Object.keys(h[1].dogs).length; j++){
                      h[1].dogs[j].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + h[1].dogs[j].id;
                    }
                    return res.status(200).json(h[1]);
                  });
                }
          });
        }
      }
    }
  });
});

//Endpoints for adding dogs and viewing dogs
//Read all dogs
router.get('/dogs', function(req, res){
  const dogs = get_dogs(LIMIT, req.query.offset)
	.then( (dogs) => {
    var obj = {};
    const accepts = req.accepts('application/json');
    if(!accepts){
      obj = {};
      obj.Error = "Not Acceptable";
      res.status(406).json(obj);
    } else if(accepts === 'application/json'){
      for (let i = 0; i < Object.keys(dogs).length; i++){
        dogs[i].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + dogs[i].id;
        if (dogs[i].home.name !== null){
          dogs[i].home.self = req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + dogs[i].home.id;
        }
        else{
          dogs[i].home.self = null;
          dogs[i].home.id = null;
        }
      }
      if ( req.query.offset === undefined){
        var offset_val = 0;
      }
      else{
        var offset_val = parseInt(req.query.offset,10);
      }
      //get total dogs from datastore
      const total_dogs = get_dogs_nolimit()
      .then( (total_dogs) => {
          var count = Object.keys(total_dogs).length;
          if ( req.query.offset === undefined){
            var offset_val = 0;
            var add = 5;
          }
          else{
            var offset_val = parseInt(req.query.offset,10);
            var add = 5;
          }
          if ((count) > (LIMIT + offset_val)){
              var link = { "next" : req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/?limit='+LIMIT+'&offset='+(parseInt(offset_val,10) + add)};
              dogs.push(link);
          }
          var count_obj = { "total_count" : count};
          dogs.push(count_obj);
          res.status(200).json(dogs);
      });
    }
    else{
      obj = {};
      obj.Error = "Content type got messed up!";
      res.status(500).json(obj);
    }
    });
});

//Read one dog
router.get('/dogs/:id', function(req, res){
var obj = {};
const dog = get_dog(req.params.id)
.then( (dog) => {
  if (dog[0] === undefined){
    obj = {};
    obj.Error = "No dog with that dog_id";
    return res.status(404).json(obj);
  }
  else{
      const accepts = req.accepts(['application/json']);
      if(!accepts){
        obj = {};
        obj.Error = "Not Acceptable";
        res.status(406).json(obj);
      } else if(accepts === 'application/json'){
          dog[0].id = req.params.id
          dog[0].self = req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + req.params.id;
          if (dog[0].home.name !== null){
            dog[0].home.self = req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + dog[0].home.id;
          }
          else{
            dog[0].home.self = null;
            dog[0].home.id = null;
          }
          res.status(200).json(dog[0]);
      } else {
        obj = {};
        obj.Error = "Content type got messed up!";
        res.status(500).json(obj);
      }
    }
  });
});

//Create dog
router.post('/dogs', function(req, res){
    //correct body content (json)
    if(req.get('content-type') !== 'application/json'){
        var obj ={};
        obj.Error = "Server only accepts application/json data.";
        res.status(415).json(obj);
    }
    else{
      //correct body response (json)
      const accepts = req.accepts(['application/json']);
        if(!accepts){
          var obj ={};
          obj.Error = "Not Acceptable";
          res.status(406).json(obj);
        }
        else if(accepts === 'application/json'){
          if (req.body.name != null && req.body.type != null && req.body.age != null){
            var home = req.body.home;
            if (req.body.home == null){
              home = {};
              home.name = null;
            }
            else{
              home = {};
              home.name = null;
            }
              post_dog(req.body.name, req.body.type, req.body.age, home)
              .then( pdog => {
                if (pdog[0] === undefined){
                  var obj = {};
                  obj.Error = "The request object is missing at least one of the required attributes";
                  res.status(400).json(obj);
                }
                  res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + pdog[0].id);
                  pdog[1].id = pdog[0].id;
                  pdog[1].self = req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + pdog[0].id;
                  res.status(201).json(pdog[1]);
              });
            }
            else{
              obj ={};
              obj.Error = "The request object is missing at least one of the required attributes";
              res.status(400).json(obj);
            }
          }
        }
});

//Delete dog
router.delete('/dogs/:id', function(req, res){
  const dog = get_dog(req.params.id)
  .then( (dog) => {
      if (dog[0] === undefined){
        var obj = {};
        obj.Error = "No dog with that dog_id";
        return res.status(404).json(obj);
      }
      else{
        var h_id;
        if (dog[0].home.id != null){
          h_id = dog[0].home.id;
          obj ={};
          obj.Error = "Cannot delete a dog in a home, please remove first at the end point /dogs/:d_id/houses/:h_id with token";
          res.status(400).json(obj);
        }
        else{//dog has no home
          delete_dog(req.params.id)
          .then(res.status(204).end());
        }
        //if dog in home error, need to remove from house first
        //house_elim_dog(h_id, req.params.id)
        //.then(delete_dog(req.params.id)
        //.then(res.status(204).end()));
      }
    });
});

//Update patch dog
router.patch('/dogs/:id', function(req, res){
    //correct body content (json)
    if(req.get('content-type') !== 'application/json'){
      var obj ={};
      obj.Error = "Server only accepts application/json data.";
      res.status(415).json(obj);
    }
    else{
     //correct body response (json)
     const accepts = req.accepts(['application/json']);
     if(!accepts){
        var obj = {};
        obj.Error = "Not Acceptable";
        res.status(406).json(obj);
      } else if(accepts === 'application/json'){
        const dog = get_dog(req.params.id)
        .then( (dog) => {
            if (dog[0] === undefined){
              var obj = {};
              obj.Error = "No dog with that dog_id";
              return res.status(404).json(obj);
            }
            else{
              const d = patch_dog(req.params.id, req.body.name, req.body.type, req.body.age)
              .then( (d) => {
                  d[1].id = d[0].id;
                  d[1].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + d[0].id;
                  if (d[1].home.name !== null){
                    d[1].home.self = req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + d[1].home.id;
                  }
                  else{
                    d[1].home.self = null;
                    d[1].home.id = null;
                  }
                  return res.status(200).json(d[1]);
                });
             }
        });
      }
    }
});

//Update put dog
router.put('/dogs/:id', function(req, res){
    //correct body content (json)
    if(req.get('content-type') !== 'application/json'){
      var obj ={};
      obj.Error = "Server only accepts application/json data.";
      res.status(415).json(obj);
    }
    else{
     //correct body response (json)
     const accepts = req.accepts(['application/json']);
     if(!accepts){
        var obj = {};
        obj.Error = "Not Acceptable";
        res.status(406).json(obj);
      } else if(accepts === 'application/json'){
        const dog = get_dog(req.params.id)
        .then( (dog) => {
            if (dog[0] === undefined){
              var obj = {};
              obj.Error = "No dog with that dog_id";
              return res.status(404).json(obj);
            }
            else{
              const d = put_dog(req.params.id, req.body.name, req.body.type, req.body.age)
              .then( (d) => {
                  d[1].id = d[0].id;
                  d[1].self =  req.protocol + "://" + req.get('host') + req.baseUrl + '/dogs/' + d[0].id;
                  if (d[1].home.name !== null){
                    d[1].home.self = req.protocol + "://" + req.get('host') + req.baseUrl + '/houses/' + d[1].home.id;
                  }
                  else{
                    d[1].home.self = null;
                    d[1].home.id = null;
                  }
                  return res.status(200).json(d[1]);
                });
             }
        });
      }
    }
});

//Update dog into house
router.put('/dogs/:d_id/houses/:h_id', checkJwt, function(req, res){
  var owner = jwtDecode(req.headers.authorization).sub
  const exists = get_house(req.params.h_id)
  .then( (exists) => {
    if (exists[0] === undefined){
        var obj ={};
        obj.Error = "No house with that house_id";
        res.status(404).json(obj);
    }
    else{
      const houses = get_houses_nolimit(owner)
      .then( (houses) => {
        var found = 0;
        var valid_owner = 0;
        for (let i = 0; i < Object.keys(houses).length; i++){
            if ((houses[i].id).localeCompare(req.params.h_id) === 0){
              found = 1;
              if((owner).localeCompare(houses[i].owner) === 0){
                valid_owner = 1;
              }
            }
        }
          if(valid_owner === 0){//valid jwt but doesn't match sub
            var obj = {};
            obj.Error = "valid jwt but doesn't match the owner of house";
            return res.status(403).json(obj);
          }
          else{
            var obj = {};
            const dogs = assign_dog(req.params.d_id, req.params.h_id)
            .then( (dogs) => {
              if (dogs.Error === "No dog with that dog_id"){
                obj ={};
                  obj.Error = "No dog with that dog_id";
                  res.status(404).json(obj);
              }
              else if (dogs.Error === "No house with that house_id"){
                obj ={};
                  obj.Error = "No house with that house_id";
                  res.status(404).json(obj);
              }
              else if (dogs.Error === "dog already on another house, remove it first"){
                obj ={};
                  obj.Error = "dog already on another house, remove it first";
                  res.status(400).json(obj);
              }
              else{
                obj ={};
                res.status(204).json(obj);
              }
            });
          }
      });
    }
  });
});

//Update dog out of house
router.delete('/dogs/:d_id/houses/:h_id', checkJwt, function(req, res){
  var owner = jwtDecode(req.headers.authorization).sub
  const exists = get_house(req.params.h_id)
  .then( (exists) => {
    if (exists[0] === undefined){
        var obj ={};
        obj.Error = "No house with that house_id";
        res.status(404).json(obj);
    }
    else{
      const houses = get_houses_nolimit(owner)
      .then( (houses) => {
        var found = 0;
        var valid_owner = 0;
        for (let i = 0; i < Object.keys(houses).length; i++){
            if ((houses[i].id).localeCompare(req.params.h_id) === 0){
              found = 1;
              if((owner).localeCompare(houses[i].owner) === 0){
                valid_owner = 1;
              }
            }
        }
          if(valid_owner === 0){//valid jwt but doesn't match sub
            var obj = {};
            obj.Error = "valid jwt but doesn't match the owner of house";
            return res.status(403).json(obj);
          }
          else{
            var obj = {};
            const dogs = unassign_dog(req.params.h_id, req.params.d_id)
            .then( (dogs) => {
                if (dogs.Error === "No dog with that dog_id"){
                  obj ={};
                    obj.Error = "No dog with that dog_id";
                    res.status(404).json(obj);
                }
                else if (dogs.Error === "dog not assigned to house yet"){
                  obj ={};
                    obj.Error = "dog not assigned to house yet";
                    res.status(400).json(obj);
                }
                else if (dogs.Error === "dog not assigned to that house"){
                  obj ={};
                    obj.Error = "dog not assigned to that house";
                    res.status(400).json(obj);
                }
                else{
                  obj ={};
                  res.status(204).json(obj);
                }
            });
          }
      });
    }
  });
});

//Delete all houses
router.delete('/allh', checkJwt, function(req, res){
  //get total houses from datastore
  const total_houses = get_houses_total()
  .then( (total_houses) => {
      var count = Object.keys(total_houses).length;
      for (let i = 0; i < count; i++){
        delete_house(total_houses[i].id);
      }
      var obj ={};
      res.status(204).json(obj);
  });
});

//Delete all dogs
router.delete('/alld', function(req, res){
  //get total dogs from datastore
  const total_dogs = get_dogs_nolimit()
  .then( (total_dogs) => {
      var count = Object.keys(total_dogs).length;
      for (let i = 0; i < count; i++){
        delete_dog(total_dogs[i].id);
      }
      var obj ={};
      res.status(204).json(obj);
  });
});

//405 Errors
router.delete('/houses', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb DELETE works with /dogs/:id and /houses/:id and /dogs/:d_id/houses/:h_id endpoint";
    res.set('Accept', 'GET, POST');
    res.status(405).json(obj);
});

router.patch('/houses', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb PATCH works with /dogs/:id and /houses/:id endpoint";
    res.set('Accept', 'GET, POST');
    res.status(405).json(obj);
});

router.put('/houses', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb PUT works with /dogs/:id and /houses/:id and /dogs/:d_id/houses/:h_id endpoint";
    res.set('Accept', 'GET, POST');
    res.status(405).json(obj);
});

router.post('/houses/:id', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb POST works with /dogs and /houses endpoint";
    res.set('Accept', 'DELETE, GET, PATCH, PUT');
    res.status(405).json(obj);
});

router.delete('/dogs', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb DELETE works with /dogs/:id and /houses/:id and /dogs/:d_id/houses/:h_id endpoint";
    res.set('Accept', 'GET, POST');
    res.status(405).json(obj);
});

router.patch('/dogs', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb PATCH works with /dogs/:id and /houses/:id endpoint";
    res.set('Accept', 'GET, POST');
    res.status(405).json(obj);
});

router.put('/dogs', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb PUT works with /dogs/:id and /houses/:id and /dogs/:d_id/houses/:h_id endpoint";
    res.set('Accept', 'GET, POST');
    res.status(405).json(obj);
});

router.post('/dogs/:id', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb POST works with /dogs and /houses endpoint";
    res.set('Accept', 'DELETE, GET, PATCH, PUT');
    res.status(405).json(obj);
});

router.get('/dogs/:d_id/houses/:h_id', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb GET works with /dogs and /houses and /dogs/:id and /houses/:id endpoint";
    res.set('Accept', 'PUT, DELETE');
    res.status(405).json(obj);
});

router.post('/dogs/:d_id/houses/:h_id', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb POST works with /dogs and /houses endpoint";
    res.set('Accept', 'PUT, DELETE');
    res.status(405).json(obj);
});

router.patch('/dogs/:d_id/houses/:h_id', function (req, res){
  var obj ={};
  obj.Error = "HTTP verb PATCH works with /dogs/:id and /houses/:id endpoint";
    res.set('Accept', 'PUT, DELETE');
    res.status(405).json(obj);
});

/* ------------- End Controller Functions ------------- */


app.use('/', router);
app.use('/login', login);
app.use(function (err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
      var obj = {};
      obj.Error = 'invalid token...';
    res.status(401).json(obj)
  }
});

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});
