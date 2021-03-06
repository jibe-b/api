// CL API integration with the Grist API
// Docs: https://europepmc.org/GristAPI
// Fields you can search by: https://europepmc.org/GristAPI#API

// Example, get info by grant ID: http://www.ebi.ac.uk/europepmc/GristAPI/rest/get/query=gid:088130&resultType=core&format=json
// Use case: To get the name of a Principal Investigator, call CLapi.internals.use.grist.grant_id(the_grant_id).data.Person
//           Will return {FamilyName: "Friston", GivenName: "Karl", Initials: "KJ", Title: "Prof"}

CLapi.addRoute('/use/grist', {
  get: {
    action: function () {
      var routes = [];
      for ( var k in CLapi.internals.use.grist ) routes.push(k);
      return {status: 'success', routes: routes, data: {info: 'returns a subset of the Grist API functionality'} };
    }
  }
});

CLapi.addRoute('use/grist/grant_id/:qry', {
  get: {
    action: function() {
      var res = CLapi.internals.use.grist.grant_id(this.urlParams.qry);
      try {
        return {status: 'success', data: res.data , total: res.total}
      } catch(err) {
        return {status: 'success', data: res.data , total: res.total}
      }
    }
  }
});

CLapi.internals.use.grist = {};

CLapi.internals.use.grist.grant_id = function(grant_id) {
  return CLapi.internals.use.grist.search('gid:' + grant_id);
};

CLapi.internals.use.grist.search = function(qrystr,from,page) {
  const GRIST_API_PAGE_SIZE = 25;  // it's hardcoded to 25 according to the docs
  // note in Grist API one of the params is resultType, in EPMC REST API the same param is resulttype .
  var url = 'http://www.ebi.ac.uk/europepmc/GristAPI/rest/get/query=' + qrystr + '&resultType=core&format=json';
  console.log("Grist API HTTP Get to " + url);
  if (from !== undefined) url += '&page=' + (Math.floor(from/GRIST_API_PAGE_SIZE)+1);
  try {
    var res = Meteor.http.call('GET', url);
    var data = res.data.RecordList && res.data.RecordList.Record ? res.data.RecordList.Record : {}
    return { status: 'success', total: res.data.HitCount, data: data};  // RecordList is an object?!
  } catch(err) {
    return { status: 'error', data: 'Grist API GET failed' }
  }
};