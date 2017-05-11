
clogin = {};

clogin.getCookie = function(cname) {
  if (cname === undefined) cname = clogin.cookie;
  var name = cname + "=";
  var ca = document.cookie.split(';');
  for (var i=0; i<ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0)==' ') c = c.substring(1);
    if (c.indexOf(name) != -1) return JSON.parse(decodeURIComponent(c.substring(name.length,c.length)));
  }
  return false;
}

clogin.setCookie = function(name, values, options) {
  options = options || {};
  var text = name + '=';
  if (values) {
    if (!options.raw) values = encodeURIComponent(JSON.stringify(values));
    text += values;
  }

  // expires
  var date = options.expires;
  if (typeof date === 'number') {
    date = new Date();
    date.setDate(date.getDate() + options.expires);
  }
  if (date instanceof Date) text += '; expires=' + date.toUTCString();
  // domain
  if (typeof options.domain === 'string' && options.domain !== '') text += '; domain=' + options.domain;
  // path
  if (typeof options.path === 'string' && options.path !== '') {
    text += '; path=' + options.path;
  } else {
    text += '; path=/';      
  }
  // secure
  if (options.secure) text += '; secure';
  // httponly
  if (options.httponly) text += '; HttpOnly';
  
  document.cookie = text;
  return text;
};

clogin.removeCookie = function(name,domain) {
  clogin.setCookie(name,undefined,{domain:domain,expires:-1});
}

// this could actually be a remote call, and probably has to be for more complex role checks
// otherwise all role complexity would have to be replicated here and in the backend
// for now just checks for existence of root role or specified group.role
clogin.hasRole = function(grouprole) {
  var parts = grouprole.split('.');
  var group = parts.length === 2 ? parts[0] : '__global_roles__';
  var role = parts.length === 2 ? parts[1] : parts[0];
  var roles = clogin.getCookie().roles;
  return roles && ( (roles[group] && roles[group].indexOf(role) !== -1) || (roles.__global_roles__ && roles.__global_roles__.indexOf('root') !== -1) );
}
clogin.addrole = function(grouprole,uid) {
  if (uid === undefined) uid = clogin.user.account._id;
  var opts = {
    type:'POST',
    url: clogin.api + '/'+uid+'/roles/'+grouprole,
    success: function(data) {
      console.log('role add success');
    },
    error: function(data) {}
  }
  if (clogin.apikey) opts.beforeSend = function (request) { request.setRequestHeader("X-apikey", clogin.apikey); }
  $.ajax(opts);  
}
clogin.removerole = function(grouprole,uid) {
  if (uid === undefined) uid = clogin.user.account._id;
  var opts = {
    type:'DELETE',
    url: clogin.api + '/'+uid+'/roles/'+grouprole,
    success: function(data) {
      console.log('role remove success');
    },
    error: function(data) {}
  }
  if (clogin.apikey) opts.beforeSend = function (request) { request.setRequestHeader("X-apikey", clogin.apikey); }
  $.ajax(opts);  
}

// if a user is logged in you can then control which parts of UI to show them
// NOTE this is not secure - if your UI has unsecure data in it, anyone can see it if they know how
// but this is actually always the case. Any app that can be within the js context of the browser page 
// has access to the content that is in the page, including the cookies. So we are no worse off, 
// as long as we retrieve the sensitive data via js and insert into the page IF the user is signed in.

// If the user is logged in, and if the accounts system is setting cookies that are not limited to httponly,
// then a query can be sent to the accounts API for more account data about the logged in user, such as their API key.

clogin.location = 'body'; // this is NECESSARY if you want the login init to build you an actual login form. It should be an ID of a div already on the page

clogin.api = window.location.host.indexOf('test.cottagelabs.com') === -1 ? 'https://api.cottagelabs.com/accounts' : 'https://dev.api.cottagelabs.com/accounts';
clogin.fingerprint = true; // if true the fingerprint library will be necessary before the clogin library too (this will be necessary for CL logins)
clogin.hashlength = 40; // this should ideally be retrieved via an init request to accounts API for config settings
clogin.tokenlength = 7; // as above
clogin.cookie = 'clogins'; // the name we use for our login cookie
clogin.days = 180;
clogin.next = undefined; //  place to go after login (can be read from url vars too, and from old cookie)
clogin.edit = true; // if true, and if user account data is retrieved, an editor function will make it editable on the page
clogin.apikey = undefined; // this could be set manually but should not be. If cookies are restricted to httponly the backend will return a key that can be used

// use the following div and area IDs and classes when building your own page, and functionality of this app will just call onto your page as expected

clogin.loggedinClass = 'cloggedin'; // anything with this class will be shown after logged in
clogin.notLoggedinClass = 'notcloggedin'; // anything with this class is shown when not logged in

clogin.loadingId = 'cloginLoading'; // the ID of something to be shown when doing something, then hidden when done

clogin.loginDivId = 'cloginArea'; // if this already exists on the page, i.e. you use it yourself to make an area, then a login area will not be made for you
clogin.loggedinDivId = 'cloggedinArea'; // where to place info about the user once logged in (you prob want to customise afterLogin to handle this, as it is rudimentary)
clogin.messagesDivId = 'cloginMessages'; // a div where messages will get put into, from the various actions that could occur

clogin.emailDivId = 'cloginEmailArea'; // the div to show the email box and login button (gets hidden after email entered)
clogin.emailDivText = '';
clogin.emailInputId = 'cloginEmail'; // the ID of the email input element, where the email should be read from on first submit
clogin.emailInputPlaceholder = 'Enter your email address';
clogin.emailSubmitButtonId = 'cloginSubmit'; // the button that triggers the email submission, requesting to send a token to the email address
clogin.emailSubmitButtonText = 'Login / Register';

clogin.tokenDivId = 'cloginTokenArea'; // the div of the area that shows the login token input box and the button that triggers it, and any other related info you put in it
clogin.tokenDivText = '';
clogin.tokenInputId = 'cloginToken'; // the ID of the box where the login token should be read from
clogin.tokenInputPlaceholder = 'Check your email, enter your login code - or just click the link in the email';

clogin.logoutButtonId = 'cloginLogout';

// there should be a form to build editability too, but there is not yet so that has to be made manually.
// however the save function will automatically show a saved success message if a suitably identified area is present
clogin.saveClass = 'cloginSave'; // add this class to any item that should have its value saved on save - expects items to have data-dotname attr
clogin.saveButtonId = 'cloginSave';
clogin.saveSuccessDivId = 'cloginSaved';
clogin.saveMessagesDivId = 'cloginSaveMessages'; // a div where messages will get put into if they are about save actions

//useful info is put in here 
clogin.user = {
  email:undefined, // set to email string when user provides email, or email found in cookie
  account:undefined, // set to user object when user account info retrieved via login or account info retrieval - expect profile object and username string keys
  token:undefined, // set to success or error after a request is sent to get a login email token sent to a user. Also token supplied in UI is stored here
  login:undefined, // set to success or error after login attempt is sent to backend
  logout:undefined, // as above but for logout...
  retrieved:undefined, // set to success or error when user account info is retrieved
  save:undefined, // set to success or error when user account is saved back to backend
  fingerprint:undefined // whenever a device fingerprint is calculated it will be stored here
};

// the following functions can be customised, but do not necessarily need to be
// it may be useful to customise the failure callback if you have a contact email address, and 
// there is also the afterLogin function where you can put any functionality you want to happen after a login is completed

clogin.afterFailure = function(data,action) {} // a function to customise to do something after failure
clogin.failureCallback = function(data,action) {
  if (clogin.loadingId) $('#'+clogin.loadingId).hide();
  if ( action === 'login' && $('#'+clogin.tokenInputId).length && $('#'+clogin.tokenInputId).val().length === clogin.tokenlength ) {
    // token login error seems to be occurring, so say token must be invalid
    $('#'+clogin.messagesDivId).html('<p>Sorry, your login token appears to be invalid. Please refresh the page and try logging in again.</p>');
  }
  data.page = window.location.href;
  data.action = action;
  data.user = clogin.user;
  data.cookie = clogin.getCookie();
  try {
    data.navigator = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      plugins: navigator.plugins
    }
  } catch(err) {}
  $.ajax({
    type:'POST',
    url: 'https://dev.api.cottagelabs.com/mail/error?token=08f98hfwhef98wehf9w8ehf98whe98fh98hw9e8h',
    cache:false,
    processData:false,
    contentType: 'application/json',
    dataType: 'json',
    data:JSON.stringify(data)
  });
  if (typeof clogin.afterFailure === 'function') clogin.afterFailure();
}

clogin.afterSave = function() {} // a function to customise to do something after save
clogin.saveSuccess = function() {
  clogin.user.save = 'success';
  if (clogin.loadingId) $('#'+clogin.loadingId).hide();
  $('#'+clogin.saveSuccessDivId).show();
  if ($('#'+clogin.saveMessagesDivId).length) $('#'+clogin.saveMessagesDivId).html('<p>Your changes have been saved.</p>');
  setTimeout(function() { $('#'+clogin.saveSuccessDivId).hide(); }, 3000);
  if (typeof clogin.afterSave === 'function') clogin.afterSave();
}
clogin.saveValidate = function() {
  // user can define this to do something that validates if the data is ready to be saved,
  // if not, set the page as necessary to warn the user and return false
  // otherwise return true
  return true;
}
clogin.save = function(event,data) {
  if ($('#'+clogin.saveMessagesDivId).length) $('#'+clogin.saveMessagesDivId).html('');
  if (clogin.loadingId) $('#'+clogin.loadingId).show();
  if (data === undefined) {
    data = {}
  }
  $('.'+clogin.saveClass).each(function() { // TODO could have other ways of identifying items to choose as value holders
    var dotname = $(this).attr('data-dotname') ? $(this).attr('data-dotname') : $(this).attr('id');
    var val;
    if ( $(this).attr('data-value') ) val = $(this).attr('data-value');
    if ( $(this).is(':checkbox') ) {
      val = $(this).is(':checked') ? true : false;
    }
    if ( $(this).is(':radio') ) {
      if ( val === undefined ) {
        val = $(this).val();
      } else if ( $(this).is(':checked') ) {
        if ( val ) {
          if (typeof val === 'string') val = [val];
          val.push($(this).val());
        } else {
          val = $(this).val();
        }
      }
    }
    // could be a checkbox or a radio group - find out
    if (val === undefined) val = $(this).val();
    if ( !val && $(this).html() ) val = $(this).html();
    if (dotname && val !== undefined) {
      var ref = data;
      var parts = dotname.split('.');
      for ( var p in parts ) {
        if (parseInt(p) === parts.length-1) {
          ref[parts[p]] = val;
        } else {
          if (ref[parts[p]] === undefined) ref[parts[p]] = {};
          ref = ref[parts[p]];
        }
      }
    }
  });
  // TODO should there be a data undot option?
  // what can be updated should be controlled on the backend. So what should be shown on the page should match that
  // if api key available, or no cookie, should this be allowed anyway? For now assume cookies otherwise there are more complex concerns
  var opts = {
    type:'POST',
    url: clogin.api + '/' + clogin.user.email,
    cache:false,
    processData:false,
    contentType: 'application/json',
    dataType: 'json',
    success: clogin.saveSuccess,
    error: function(data) {
      clogin.user.save = 'error';
      clogin.failureCallback(data,'save');
    },
    data: JSON.stringify(data)
  }
  if (clogin.apikey) opts.beforeSend = function (request) { request.setRequestHeader("X-apikey", clogin.apikey); }
  if (clogin.saveValidate()) $.ajax(opts);
}

clogin.editor = function() {
  if (clogin.edit && clogin.user.account) {
    // todo build an editor onto the screen
  }
}
clogin.form = function(matcher) {
  if (matcher === undefined) matcher = clogin.locationId;
  if ( !$('#'+clogin.loginDivId).length && matcher && $('#'+matcher).length ) {
    var form = '<div id="' + clogin.loginDivId + '" class="' + clogin.notLoggedinClass + '">';
    form += '<div id="' + clogin.emailDivId + '">';
    form += clogin.emailDivText;
    form += '<p><input type="email" class="form-control" id="' + clogin.emailInputId + '" placeholder="' + clogin.emailInputPlaceholder + '"></p>';
    form += '<p><button id="' + clogin.emailSubmitButtonId + '" type="submit" class="btn btn-primary btn-block">' + clogin.emailSubmitButtonText + '</button></p>';
    form += '</div>';
    form += '<div id="' + clogin.tokenDivId + '" style="display:none;">';
    form += clogin.tokenDivText;
    form += '<p><input type="text" class="form-control" id="' + clogin.tokenInputId + '" placeholder="' + clogin.tokenInputPlaceholder + '"></p>';
    form += '</div>';
    form += '</div>';
    form += '<div id="' + clogin.loggedinDivId + '" class="' + clogin.loggedinClass + '" style="display:none;">';
    clogin.user.account && clogin.user.account.username ? form += clogin.user.account.username : clogin.user.email
    form += '</div>';
    form += '<div id="' + clogin.messagesDivId + '" style="margin-top:5px;"></div>';
    form += '<div id="' + clogin.loadingId + '"><img style="height:30px;" src="//static.cottagelabs.com/spinner.gif"></div>';
    $(matcher).html(form);
  }
  $('#'+clogin.emailSubmitButtonId).bind('click',clogin.token);
  $('#'+clogin.tokenInputId).bind('keyup',clogin.loginWithToken);
  $('#'+clogin.logoutButtonId).bind('click',clogin.logout);
  $('#'+clogin.saveButtonId).bind('click',clogin.save);
}

clogin.retrieve = function(email,callback) {
  // get account details, then do something if callback is provided
  // this will work as is, if cookies are not restricted to httponly
  // if cookies are resstricted, an api key is necessary
  if (clogin.loadingId) $('#'+clogin.loadingId).show();
  $('#'+clogin.messagesDivId).html('');
  var opts = {
    type:'GET',
    url: clogin.api + '/'+clogin.user.email,
    success: function(data) {
      if (clogin.loadingId) $('#'+clogin.loadingId).hide();
      clogin.user.retrieved = 'success';
      clogin.user.account = data.data;
      if (typeof callback === 'function') callback();
    },
    error: function(data) {
      clogin.user.retrieved = 'error';
      clogin.user.account = 'error';
    }
  }
  if (clogin.apikey) opts.beforeSend = function (request) { request.setRequestHeader("X-apikey", clogin.apikey); }
  $.ajax(opts);
}

clogin.hash = function() {
  // check for a hash on the page url
  try {
    var hash = window.location.hash.replace('#','');
    if ( hash && hash.length === clogin.hashlength ) {
      clogin.user.hash = hash;
      return hash;
    } else {
      return '';
    }
  } catch(err) {
    return '';
  }
}

clogin.tokenSuccess = function(data) {
  if (data && data.responseText) data = data.responseText;
  console.log(data);
  // TODO if there is an mid in data, record the ID in a cookie and trigger a 5s intervaled mail progress check
  // this also means that on any page that inits clogin, we should check for this mid and show the token
  // process as in progress
  clogin.user.token = 'success';
  $('#'+clogin.emailDivId).hide();
  $('#'+clogin.tokenDivId).show();
  if (clogin.loadingId) $('#'+clogin.loadingId).hide();
}
clogin.token = function(e) {
  if (e) e.preventDefault();
  if (clogin.loadingId) $('#'+clogin.loadingId).show();
  $('#'+clogin.messagesDivId).html('');
  // request a token be sent to the email address
  // TODO add a mailgun email verification step - if not verified, bounce back to the user to fix and try again
  if (clogin.user.email === undefined) clogin.user.email = $('#'+clogin.emailInputId).val();
  var opts = {
    type:'POST',
    success:clogin.tokenSuccess,
    error:clogin.tokenSuccess,
    url: clogin.api + '/token'
  }
  var location = window.location.protocol+'//'+window.location.hostname
  if (window.location.pathname !== '/') location += window.location.pathname;
  if (opts.type === 'POST') {
    opts.data = {
      email: clogin.user.email,
      location: location
    };
    opts.dataType = 'JSON';
    opts.contentType = 'application/json';
  } else {
    opts.url += '?email='+encodeURIComponent(clogin.user.email)+'&location='+location;
  }
  if (clogin.fingerprint) {
    new Fingerprint2().get(function(result, components) {
      clogin.user.fingerprint = result;
      if (opts.type === 'POST') {
        opts.data.fingerprint = result;
        opts.data = JSON.stringify(opts.data);
      } else {
        opts.url += '&fingerprint=' + result;      
      }
      $.ajax(opts);
    });
  } else {
    $.ajax(opts);
  }
  // this should really be the ajax success callback, but some browsers appear to behave oddly after the GET request
  // even if it is successful. So instead just call it directly.
  if (opts.type === 'GET') clogin.tokenSuccess();
}
clogin.loginWithToken = function() {
  var token = $('#'+clogin.tokenInputId).val();
  if ( token.length === clogin.tokenlength ) clogin.login();
}

clogin.afterLogin = function() {
  // something the user of this lib can configure to do things after the loginCallback runs
  // or they could just overwrite the loginCallback for complete control
  if (clogin.next) window.location = clogin.next;
}
clogin.loginSuccess = function(data) {
  clogin.user.login = 'success';
  $('#'+clogin.emailDivId).show(); // just in case they were still set to token display
  $('#'+clogin.tokenDivId).hide();
  $('.'+clogin.notLoggedinClass).hide();
  $('.'+clogin.loggedinClass).show();
  if (clogin.loadingId) $('#'+clogin.loadingId).hide();
  clogin.apikey = data.data.apikey;
  clogin.user.account = data.data.account;
  clogin.editor();

  var nextcookie = clogin.getCookie('clnext');
  if (nextcookie) {
    clogin.next = nextcookie.next;
    clogin.removeCookie('clnext');
  }

  var cookie = data.data.cookie;
  if (clogin.user.email === undefined) clogin.user.email = cookie.email;
  var settings = data.data.settings;
  if (clogin.fingerprint) {
    new Fingerprint2().get(function(result, components) {
      clogin.user.fingerprint = result;
      cookie.fp = result;
      clogin.setCookie(clogin.cookie, cookie, settings);
      if (typeof clogin.afterLogin === 'function') clogin.afterLogin();
    });
  } else {
    clogin.setCookie(clogin.cookie, cookie, settings);
    if (typeof clogin.afterLogin === 'function') clogin.afterLogin();
  }
}
clogin.login = function(e) {
  if (e) e.preventDefault();
  $('#'+clogin.messagesDivId).html('');
  if (!clogin.next && window.location.href.indexOf('next=') !== -1) clogin.next = window.location.href.split('next=')[1].split('&')[0];
  if (!clogin.next && clogin.getCookie('clnext')) clogin.next = clogin.getCookie('clnext');
  if (clogin.next && !clogin.getCookie('clnext')) clogin.setCookie('clnext', {next:clogin.next}, {expires:1});
  var opts = {
    type:'POST',
    url: clogin.api + '/login',
    cache:false,
    processData:false,
    contentType: 'application/json',
    dataType: 'json',
    success: clogin.loginSuccess,
    error: function(data) {
      clogin.user.login = 'error';
      clogin.failureCallback(data,'login');
    }
  }
  var data = {
    email: clogin.user.email,
    token: $('#'+clogin.tokenInputId).val(),
    hash: clogin.hash(),
    location: window.location.protocol + '//' + window.location.hostname
  }
  clogin.user.token = data.token;
  if (window.location.pathname !== '/') data.location += window.location.pathname;
  var cookie = clogin.getCookie();
  if (cookie) {
    if ( !data.email ) data.email = cookie.email;
    data.fingerprint = cookie.fp;
    if (!data.token && !data.hash) {
      data.resume = cookie.resume;
      data.timestamp = cookie.timestamp;
      data.location = cookie.url;
    }
  }
  opts.data = JSON.stringify(data);
  if ( data.email || data.hash ) {
    if (clogin.loadingId) $('#'+clogin.loadingId).show();
    $.ajax(opts);
  }
}

clogin.afterLogout = function() {}
clogin.logoutSuccess = function(data) {
  clogin.removeCookie(clogin.cookie,data.data.domain);
  clogin.apikey = undefined; // just in case one was set
  clogin.user = {logout:'success'};
  $('.'+clogin.loggedinClass).hide();
  $('.'+clogin.notLoggedinClass).show();
  if (clogin.loadingId) $('#'+clogin.loadingId).hide();
  // and what if they want to logout all sessions, not just this one?
  if (typeof clogin.afterLogout === 'function') clogin.afterLogout();
}
clogin.logout = function(e) {
  if (e) e.preventDefault();
  if (clogin.loadingId) $('#'+clogin.loadingId).show();
  $('#'+clogin.messagesDivId).html('');
  var opts = {
    type:'POST',
    url: clogin.api + '/logout',
    cache:false,
    processData:false,
    contentType: 'application/json',
    dataType: 'json',
    success: clogin.logoutSuccess
  }
  var data = {
    email: clogin.user.email,
    location: window.location.protocol + '//' + window.location.hostname
  }
  if (window.location.pathname !== '/') data.location += window.location.pathname;
  var cookie = clogin.getCookie();
  if (cookie) {
    if ( !data.email ) data.email = cookie.email;
    data.fingerprint = cookie.fingerprint;
    data.resume = cookie.resume;
    data.timestamp = cookie.timestamp;
  }
  opts.data = JSON.stringify(data);
  if ( data.email ) $.ajax(opts);
}

clogin.ping = function() {
  // TODO init (or successful login) should set up a recurring ping, so that the backend can keep track of the user being active
  // but this would only be a track of when the logged in user is on the login page, not when on other pages of the site
}
clogin.loggedin = function() {
  return clogin.getCookie();
}
clogin.init = function(opts) {
  // this is the default init function that will put everything on the page and bind actions to it all
  // just call this to get a working default installation
  if (opts) {
    for ( var o in opts ) clogin[o] = opts[o];
  }
  // build the form even if it turns out to be unnecessary, because a login error could result in it being needed for a retry - unless specifically set not to
  if ( clogin.form && typeof clogin.form === 'function' ) clogin.form();
  if (clogin.loggedinClass) $('.'+clogin.loggedinClass).hide();
  if (clogin.notLoggedinClass) $('.'+clogin.notLoggedinClass).show();
  if (clogin.loadingId) $('#'+clogin.loadingId).hide();
  clogin.login();
}