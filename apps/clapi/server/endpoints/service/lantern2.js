
// TODO for lantern
// re-point the lantern.cottagelabs.com to the new lantern UI
// enable login (also needed for monitor, plus decision on how to create new accounts for monitor use)
// lantern user monthly row count - max 25 rows per 30 days - and throw an error when over rate
// lantern output format

// web-hook - could add to the API the ability to add a URL as a web-hook, so when a job is submitted with that URL, 
// we ping a GET to the URL provided

/*
All outgoing calls COULD be cached - europepmc, crossref, core, sherpa, doaj, pubmed - but currently are not
Grist is currently not, but perhaps SHOULD be
academic/resolve currently only caches full lookup - change it to cache DOI lookups too
*/
/*
// The Lantern API
lantern_meta = new Mongo.Collection("lantern_meta"); // meta info to store across cron checks
lantern_jobs = new Mongo.Collection("lantern_jobs"); // batches of submitted jobs from users
lantern_processes = new Mongo.Collection("lantern_processes"); // individual processes of ident object sets {doi:"blah",pmid:"same"}
lantern_results = new Mongo.Collection("lantern_results"); // results for particular identifiers
// There can be more than one result for an identified paper, because they are re-run if outwith acceptable time limit

CLapi.addCollection(lantern_meta);
CLapi.addCollection(lantern_jobs);
CLapi.addCollection(lantern_processes);
CLapi.addCollection(lantern_results);

lantern_jobs.before.insert(function (userId, doc) {
  doc.createdAt = Date.now();
});
lantern_processes.before.insert(function (userId, doc) {
  doc.createdAt = Date.now();
});
lantern_results.before.insert(function (userId, doc) {
  doc.createdAt = Date.now();
});

// curl -X POST -F "userid=1" -F "filecomment=This is a CSV file" -F "upload=@/Users/mm/Desktop/lanterntest.csv" http://dev.api.cottagelabs.com/service/lantern

lantern_processes.findByIdentifier = function(idents) {
  var m = [];
  if (idents.pmcid !== undefined && idents.pmcid !== null && idents.pmcid.length > 0 && !idents.pmcid.match(/^(PMC)*0/i)) m.push({pmcid:idents.pmcid});
  if (idents.pmid !== undefined && idents.pmid !== null && idents.pmid.length > 0 && !idents.pmid.match(/^0/)) m.push({pmid:idents.pmid});
  if (idents.doi !== undefined && idents.doi !== null && idents.doi.indexOf('10.') === 0 && idents.doi.length > 6 && idents.doi.indexOf('/') !== -1) m.push({doi:idents.doi});
  if (idents.title !== undefined && idents.title !== null && idents.title.length > 0) m.push({title:idents.title});
  if (m.length === 0) {  // causes a Mongo error otherwise, since Mongo does not like $or: [] in the queries below
    return undefined;
  }
  return lantern_processes.findOne({$or: m});
}
lantern_results.findByIdentifier = function(idents,refresh) {  
  var m = [];
  if (idents.pmcid !== undefined && idents.pmcid !== null && idents.pmcid.length > 0 && !idents.pmcid.match(/^(PMC)*0/i)) m.push({pmcid:idents.pmcid});
  if (idents.pmid !== undefined && idents.pmid !== null && idents.pmid.length > 0 && !idents.pmid.match(/^0/)) m.push({pmid:idents.pmid});
  if (idents.doi !== undefined && idents.doi !== null && idents.doi.indexOf('10.') === 0 && idents.doi.length > 6 && idents.doi.indexOf('/') !== -1) m.push({doi:idents.doi});
  if (idents.title !== undefined && idents.title !== null && idents.title.length > 0) m.push({title:idents.title});

  if (m.length === 0) {  // causes a Mongo error otherwise, since Mongo does not like $or: [] in the queries below
    return undefined;
  }

  var s = {};
  if (refresh !== undefined) {
    var d = new Date();
    var t = refresh === true ? d : d.setDate(d.getDate() - refresh);
    s.$and = [{$or:m},{createdAt:{$gte:t}}];
  } else {
    s.$or = m;
  }
  return lantern_results.findOne(s,{sort:{createdAt:-1}});
}
lantern_results.findFreshById = function(id,refresh) {  
  var d = new Date();
  var t = refresh === true ? d : d.setDate(d.getDate() - refresh);
  return lantern_results.findOne({$and:[{'_id':id},{createdAt:{$gte:t}}]},{sort:{createdAt:-1}});
}


CLapi.addRoute('service/lantern', {
  get: {
    action: function() {
      // could trigger a simple GET with query param to submit one URL
      if ( this.queryParams.apikey && ( this.queryParams.doi || this.queryParams.pmid || this.queryParams.pmc ) ) {
        var user = CLapi.internals.accounts.retrieve(this.queryParams.apikey);
        if (user) {
          var u = user._id;
          var j = lantern_jobs.insert({new:true,user:user._id});
          var b = [];
          if (this.queryParams.doi) b.push({doi:this.queryParams.doi});
          if (this.queryParams.pmid) b.push({pmid:this.queryParams.pmid});
          if (this.queryParams.pmcid) b.push({pmcid:this.queryParams.pmcid});
          var r = this.queryParams.refresh;
          var w = this.queryParams.wellcome;
          Meteor.setTimeout(function() { CLapi.internals.service.lantern.job(b,u,r,w,j); }, 5);
          return {status: 'success', data: {job:j}};
        } else {
          return {statusCode: 401, body: {status: 'error', data: 'unauthorised'}}
        }
      } else {
        return {status: 'success', data: 'The lantern API'}
      }
    }
  },
  post: {
    roleRequired: 'lantern.user',
    action: function() {
      var maxallowedlength = 3000; // this could be in config or a per user setting...
      var checklength = this.request.body.list ? this.request.body.list.length : this.request.body.length;
      var quota = this.request.body.email !== undefined ? {available:10000000,wellcome:true} : CLapi.internals.service.lantern.quota(this.userId);
      // TODO should partial jobs be accepted, up to remaining quota available / max length?
      // for now jobs that are too big are refused
      if (checklength > maxallowedlength) {
        return {statusCode: 413, body: {status: 'error', data: {length: checklength, max: maxallowedlength, info: checklength + ' too long, max rows allowed is ' + maxallowedlength}}}
      } else if (checklength > quota.available) {
        return {statusCode: 413, body: {status: 'error', data: {length: checklength, quota: quota, info: checklength + ' greater than remaining quota ' + quota.available}}}
      } else {
        var w = this.request.body.email ? true : false;
        var j = w ? lantern_jobs.insert({new:true,wellcome:true,user:this.userId}) : lantern_jobs.insert({new:true,user:this.userId});
        var b = this.request.body;
        var u = this.userId;
        var r = this.queryParams.refresh;
        Meteor.setTimeout(function() { CLapi.internals.service.lantern.job(b,u,r,w,j); }, 5);
        return {status: 'success', data: {job:j,quota:quota, max: maxallowedlength, length: checklength}};
      }
    }
  }
});

CLapi.addRoute('service/lantern/:job', {
  get: {
    roleRequired: 'lantern.user',
    action: function() {
      // return the info of the job - the job metadata and the progress so far
      // TODO if user is not the job creator or is not admin, 401
      var job = lantern_jobs.findOne(this.urlParams.job);
      if ( !CLapi.internals.service.lantern.allowed(job,this.user) ) return {statusCode:401, body:{}}
      if (job) {
        var p = CLapi.internals.service.lantern.progress(this.urlParams.job);
        job.progress = p ? p : 0;
        return {status: 'success', data: job}
      } else {
        return {statusCode: 404, body: {status: 'error', data: '404 not found'}}
      }
    }
  }
});

CLapi.addRoute('service/lantern/:job/reload', {
  get: {
    roleRequired: 'lantern.admin',
    action: function() {
      return {status: 'success', data: CLapi.internals.service.lantern.reload(this.urlParams.job) }
    }
  }
});

CLapi.addRoute('service/lantern/:job/progress', {
  get: {
    roleRequired: 'lantern.user',
    action: function() {
      // return the info of the job - the job metadata and the progress so far
      var job = lantern_jobs.findOne(this.urlParams.job);
      if ( !CLapi.internals.service.lantern.allowed(job,this.user) ) return {statusCode:401, body:{}}
      if (job) {
        var progress = CLapi.internals.service.lantern.progress(this.urlParams.job);
        return {status: 'success', data: progress}
      } else {
        return {statusCode: 404, body: {status: 'error', data: '404 not found'}}
      }
    }
  }
});

CLapi.addRoute('service/lantern/:job/todo', {
  get: {
    roleRequired: 'lantern.user',
    action: function() {
      // return the parts of the job still to do, does not check for results found since last progress check
      var job = lantern_jobs.findOne(this.urlParams.job);
      if ( !CLapi.internals.service.lantern.allowed(job,this.user) ) return {statusCode:401, body:{}}
      if (job) {
        var todo = CLapi.internals.service.lantern.todo(this.urlParams.job);
        return {status: 'success', data: todo}
      } else {
        return {statusCode: 404, body: {status: 'error', data: '404 not found'}}
      }
    }
  }
});

CLapi.addRoute('service/lantern/:job/results', {
  get: {
    roleRequired: 'lantern.user',
    action: function() {
      // return the results for this job as JSON
      var job = lantern_jobs.findOne(this.urlParams.job);
      if ( !CLapi.internals.service.lantern.allowed(job,this.user) ) return {statusCode:401, body:{}}
      // TODO may add restriction on how long old jobs can be returned for 
      // could be implemented by deleting them, or by checking here for how long the user can 
      // retrieve jobs (to be saved in a user config)
      if (!job) return {statusCode: 404, body: {status: 'error', data: '404 not found'}}
      
      var res;
      if ( this.queryParams.format && this.queryParams.format === 'csv' ) {
        var format = job.wellcome ? 'wellcome' : 'lantern';
        if ( this.queryParams.wellcome && this.queryParams.wellcome !== 'false' ) format = 'wellcome';
        if (job.email && job.email.indexOf('wellcome') !== -1) format = 'wellcome';
        res = CLapi.internals.service.lantern.results(this.urlParams.job,format);

        var fields = [
          'PMCID','PMID','DOI','Publisher','Journal title','ISSN',
          'Article title','Publication Date','Electronic Publication Date',
          'Author(s)'
        ];
        
        if (job.list && job.list.length > 0) { // TODO is this all still needed, was for special case of wellcome file upload - should we pass back additional fields found in upload file?
          if (job.list[0].University !== undefined) fields.unshift('University');
          var ffields = [
            'Title of paper (shortened)',
            'Grant References','Total cost of Article Processing Charge (APC), in £',
            'Amount of APC charged to Wellcome OA grant, in £ (see comment)','VAT charged',
            'COST (£)','Wellcome grant','licence info','Notes'
          ];
          for ( var fld in ffields) {
            if (job.list[0][ffields[fld]] !== undefined) fields.push(ffields[fld]);
          }
        }

        fields = fields.concat([
          'In CORE?','Repositories','Repository URLs','Repository fulltext URLs','Repository OAI IDs',
          'Fulltext in EPMC?','XML Fulltext?','Author Manuscript?','Ahead of Print?',
          'Open Access?','EPMC Licence','EPMC Licence source','Publisher Licence','Licence','Licence source',
          'Journal Type','Correct Article Confidence',
          'Wellcome standard compliant?','Wellcome deluxe compliant?','Preprint Embargo','Preprint Self-archiving Policy',
          'Postprint Embargo','Postprint Self-archiving Policy','Publishers Copy Embargo','Publishers Copy Self-archiving Policy'
        ]);

        var grantcount = 0;
        for ( var k in res ) {
          var rk = res[k];
          var igc = 0;
          for ( var key in rk ) {
            if (key.indexOf('Grant ') === 0) igc += 1;
          }
          if (igc > grantcount) grantcount = igc;
        }
        for ( var gi=0; gi < grantcount; gi++) {
          fields.push('Grant ' + (parseInt(gi)+1));
          fields.push('Agency ' + (parseInt(gi)+1));
          fields.push('PI ' + (parseInt(gi)+1));
        }

        fields.push('Provenance');
        
        // check the current user fields options and remove any they have set to false, and/or add/remove if present in query params
        if (this.user.service.lantern.profile && this.user.service.lantern.profile.fields) {
          for ( var f in this.user.service.lantern.profile.fields) {
            var pos = fields.indexOf(f);
            if (this.user.service.lantern.profile.fields[f] === false && pos !== -1 && ( this.queryParams[f] === undefined || this.queryParams[f] === 'false') ) fields.splice(pos,1);
          }
        }
        for ( var q in this.queryParams) {
          var pq = fields.indexOf(q);
          if (pq !== -1 && this.queryParams[q] === 'false') fields.splice(pq,1);
        }
        
        var ret = CLapi.internals.convert.json2csv({fields:fields},undefined,res);
        var name = 'results';
        if (job.name) name = job.name.split('.')[0].replace(/ /g,'_') + '_results';
        this.response.writeHead(200, {
          'Content-disposition': "attachment; filename="+name+".csv",
          'Content-type': 'text/csv',
          'Content-length': ret.length
        });
        this.response.write(ret);
        this.done();
        return {}  
      } else {
        res = CLapi.internals.service.lantern.results(this.urlParams.job);
        return {status: 'success', data: res}
      }
    }
  }
});

CLapi.addRoute('service/lantern/:job/original', {
  get: {
    roleRequired: 'lantern.user',
    action: function() {
      // wellcome found it useful to be able to download the original file, 
      // so this route should just find the job and return the file without any results
      var job = lantern_jobs.findOne(this.urlParams.job);
      if ( !CLapi.internals.service.lantern.allowed(job,this.user) ) return {statusCode:401, body:{}}
      var fl = [];
      for ( var j in job.list ) {
        var jb = job.list[j];
        if (jb.process) delete jb.process;
        //if (jb.result) delete jb.result;
        if (jb.doi !== undefined) jb.DOI = jb.doi;
        delete jb.doi;
        if (jb.pmcid !== undefined) jb.PMCID = jb.pmcid;
        delete jb.pmcid;
        if (jb.pmid !== undefined) jb.PMID = jb.pmid;
        delete jb.pmid;
        if (jb.title !== undefined) jb['Article title'] = jb.title;
        delete jb.title;
        fl.push(jb);
      }
      //return fl;
      var ret = CLapi.internals.convert.json2csv(undefined,undefined,fl);
      var name = 'original';
      if (job.name) name = job.name.split('.')[0].replace(/ /g,'_');
      //header('Content-Encoding: UTF-8');
      //header('Content-type: text/csv; charset=UTF-8');
      //header('Content-Disposition: attachment; filename=Customers_Export.csv');
      //echo "\xEF\xBB\xBF"; // UTF-8 BOM
      // http://answers.microsoft.com/en-us/mac/forum/macoffice2011-macexcel/mac-excel-converts-utf-8-characters-to-underlines/7c4cdaa7-bfa3-41a2-8482-554ae235227b?msgId=c8295574-a053-48a6-b419-51523ce2a247&auth=1
      this.response.writeHead(200, {
        'Content-disposition': "attachment; filename="+name+"_original.csv",
        'Content-type': 'text/csv',
        'Content-length': ret.length
      });
      this.response.write(ret);
      this.done();
      return {}
    }
  }
});

CLapi.addRoute('service/lantern/jobs', {
  get: {
    roleRequired: 'lantern.admin',
    action: function() {
      var results = [];
      var jobs = lantern_jobs.find();
      jobs.forEach(function(job) {
        job.processes = job.list ? job.list.length : 0;
        if (job.processes === 0) {
          lantern_jobs.remove(job._id);
        } else {
          delete job.list;
          results.push(job);          
        }
      });
      return {status: 'success', data: {total:results.length, jobs: results} }
    }
  }
});

CLapi.addRoute('service/lantern/jobs/todo', {
  get: {
    roleRequired: 'lantern.admin',
    action: function() {
      var results = [];
      var jobs = lantern_jobs.find({done:{$not:{$eq:true}}});
      jobs.forEach(function(job) {
        if (job.list) { // some old or incorrectly created jobs could have no list
          job.processes = job.list.length;
          delete job.list;
        } else {
          job.processes = 0;
        }
        results.push(job);
      });
      return {status: 'success', data: {total:results.length, jobs: results} }
    }
  },
  delete: {
    roleRequired: 'root',
    action: function() {
      var count = lantern_jobs.find({done:{$not:{$eq:true}}}).count();
      lantern_jobs.remove({done:{$not:{$eq:true}}});
      // TODO should this remove all processes associated with the jobs being deleted?
      return {status: 'success', total: count}
    }
  }
});

CLapi.addRoute('service/lantern/jobs/reload', {
  get: {
    roleRequired: 'root',
    action: function() {
      return {status: 'success', data: CLapi.internals.service.lantern.reload() }
    }
  }
});

CLapi.addRoute('service/lantern/jobs/:email', {
  get: {
    roleRequired: 'lantern.user',
    action: function() {
      var results = [];
      if ( !( CLapi.internals.accounts.auth('lantern.admin',this.user) || this.user.emails[0].address === this.urlParams.email ) ) return {statusCode:401,body:{}}
      var jobs = lantern_jobs.find({email:this.urlParams.email});
      jobs.forEach(function(job) {
        job.processes = job.list.length;
        delete job.list;
        results.push(job);
      });
      return {status: 'success', data: {total:results.length, jobs: results} }
    }
  }
});

// routes to get a count of processes, running processes, reset all processing processes to not processing
// should probably have admin auth or be removed
CLapi.addRoute('service/lantern/processes', {
  get: {
    action: function() {
      return {status: 'success', data: lantern_processes.find({}).count() }
    }
  }
});
CLapi.addRoute('service/lantern/processes/running', {
  get: {
    action: function() {
      return {status: 'success', data: lantern_processes.find({processing:{$eq:true}}).count() }
    }
  }
});
CLapi.addRoute('service/lantern/processes/reset', {
  get: {
    roleRequired: 'lantern.admin',
    action: function() {
      return {status: 'success', data: CLapi.internals.service.lantern.reset() }
    }
  }
});

// a route to trigger a specific process - should probably have admin auth or be removed
CLapi.addRoute('service/lantern/process/:proc', {
  get: {
    roleRequired: 'lantern.admin',
    action: function() {
      return {status: 'success', data: CLapi.internals.service.lantern.process(this.urlParams.proc) }
    }
  }
});

CLapi.addRoute('service/lantern/status', {
  get: {
    action: function() {
      return {
        status: 'success', 
        data: CLapi.internals.service.lantern.status()
      }
    }
  }
});

CLapi.addRoute('service/lantern/quota/:email', {
  get: {
    roleRequired: 'lantern.user',
    action: function() {
      if ( CLapi.internals.accounts.auth('lantern.admin',this.user) || this.user.emails[0].address === this.urlParams.email ) {
        return {status: 'success', data: CLapi.internals.service.lantern.quota(this.urlParams.email) }
      } else {
        return {statusCode:401, body:{}}
      }
    }
  }
});

CLapi.addRoute('service/lantern/fields/:email', {
  post: {
    roleRequired: 'lantern.user',
    action: function() {
      if ( CLapi.internals.accounts.auth('lantern.admin',this.user) || this.user.emails[0].address === this.urlParams.email ) {
        if (this.user.service.lantern.profile === undefined) {
          this.user.service.lantern.profile = {fields:{}};
          Meteor.users.update(this.userId, {$set: {'service.lantern.profile':{fields:{}}}});
        } else if (this.user.service.lantern.profile.fields === undefined) {
          this.user.service.lantern.profile.fields = {};
          Meteor.users.update(this.userId, {$set: {'service.lantern.profile.fields':{}}});
        }
        for ( var p in this.request.body ) this.user.service.lantern.profile.fields[p] = this.request.body[p];
        Meteor.users.update(this.userId, {$set: {'service.lantern.profile.fields':this.user.service.lantern.profile.fields}});
        return {status: 'success', data: this.user.service.lantern.profile.fields }
      } else {
        return {statusCode:401, body:{}}
      }
    }
  }
});


CLapi.internals.service.lantern = {};

CLapi.internals.service.lantern.allowed = function(job,uacc) {
  return job.user === uacc._id || CLapi.internals.accounts.auth('lantern.admin',uacc) || job.wellcome === true;
}

CLapi.internals.service.lantern.quota = function(uid) {
  var acc = CLapi.internals.accounts.retrieve(uid);
  var email = acc.emails[0].address;
  var max = 100;
  var admin = CLapi.internals.accounts.auth('lantern.admin',acc);
  var premium = CLapi.internals.accounts.auth('lantern.premium',acc,false );
  if ( admin ) {
    max = 500000;
  } else if ( premium ) {
    max = 5000;
  }
  var backtrack = 30;
  var additional = 0;
  var today = Date.now();
  var until = false;
  var display = false;
  if (acc && acc.service && acc.service.lantern && acc.service.lantern.additional) {
    for ( var a in acc.service.lantern.additional ) {
      var ad = acc.service.lantern.additional[a];
      if ( ad.until > today ) {
        additional = ad.quota;
        display = ad.display;
        until = ad.until;
      } else if ( ((ad.until/1000)+(30*86400))*1000 > today ) {
        // set the backtrack date, so only counts old jobs run after the last additional quota expired
        // essentially provides a reset on job quota max after an additional quota is purchased and runs out, 
        // even if the standard quota max was used as well as the additional quota, within the last 30 days.
        // so a wee bit of a bonus - but then, if someone pays for an additional quota one assumes they intend to use all the standard max anyway
        backtrack = ((30*86400) - (ad.until/1000) - (today/1000));
      }
    }
  }
  var count = 0;
  var d = new Date();
  var t = d.setDate(d.getDate() - backtrack);
  var j = lantern_jobs.find({$and:[{email:email},{createdAt:{$gte:t}}]},{sort:{createdAt:-1}});
  j.forEach(function(job) { count += job.list.length; });
  var available = max - count + additional;
  return {
    admin: admin,
    premium: premium,
    additional: additional,
    until: until,
    display: display,
    email: email,
    count: count,
    max: max,
    available: available,
    allowed: available>0
  }
}

CLapi.internals.service.lantern.status = function() {
  return {
    processes: {
      total: lantern_processes.find().count(),
      running: lantern_processes.find({processing:{$eq:true}}).count()
    },
    jobs: {
      total: lantern_jobs.find().count(),
      done: lantern_jobs.find({done:{$exists:true}}).count()
    },
    results: lantern_results.find().count(),
    users: CLapi.internals.accounts.count({"roles.lantern":{$exists:true}})
  } 
}

CLapi.internals.service.lantern.reset = function() {
  // reset all processing processes
  var procs = lantern_processes.find({processing:{$eq:true}});
  var count = 0;
  procs.forEach(function(row) {
    lantern_processes.update(row._id,{$set:{processing:undefined}});
    count += 1;
  });
  return count;
}

CLapi.internals.service.lantern.reload = function(jobid) {
  // reload all jobs with processes that still need running
  var ret = 0;
  var j = jobid ? lantern_jobs.find({'_id':jobid}) : lantern_jobs.find({done:{$not:{$eq:true}}});
  j.forEach(function(job) {
    for ( var l in job.list) {
      var pid = job.list[l].process;
      // couple of lines just to check for jobs created in the old way
      if (job.list[l].process === undefined && job.list[l].result !== undefined) {
        pid = job.list[l].result;
        var s = {};
        s["list."+l+".process"] = job.list[l].result;
        lantern_jobs.update(job._id,{$set:s});
      }
      var proc = lantern_processes.findOne(pid);
      var res;
      if (!proc) res = lantern_results.findOne(pid);
      if (pid && !proc && !res) {
          lantern_processes.insert({'_id':pid,doi:j.doi,pmcid:j.pmcid,pmid:j.pmid,title:j.title,refresh:job.refresh});
          ret += 1;
      }
    }
  });
  return ret;
}

// Lantern submissions create a trackable job
// accepts list of articles with one or some of doi,pmid,pmcid,title
CLapi.internals.service.lantern.job = function(input,uid,refresh,wellcome,jid) {
  var user = CLapi.internals.accounts.retrieve(uid);
  var job = {user:uid};
  if (wellcome) {
    if (refresh === undefined) refresh = 1;
    job.wellcome = true;
    job.email = input.email;
  } else {
    job.email = user.emails[0].address;
  }
  if (refresh === undefined) refresh = true; // a refresh of true forces always new results (0 would get anything older than today, etc into past)
  if (refresh !== undefined) job.refresh = parseInt(refresh);
  var list;
  if (input.list) { // list could be obj with metadata and list, or could just be list
    list = input.list;
    if (input.name) job.name = input.name;
  } else {
    list = input;
  }
  job.list = list;
  for ( var i in list ) {
    var j = list[i];
    if ( j.DOI ) {
      list[i].doi = j.DOI;
      delete list[i].DOI;
    }
    if ( j.PMID ) {
      list[i].pmid = j.PMID;
      delete list[i].PMID;
    }
    if ( j.PMCID ) {
      list[i].pmcid = j.PMCID;
      delete list[i].PMCID;
    }
    if ( j.TITLE ) {
      list[i].title = j.TITLE;
      delete list[i].TITLE;
    }
    if ( j['Article title'] ) {
      list[i].title = j['Article title'];
      delete list[i]['Article title'];
    }
    if (j.title) j.title = j.title.replace(/\s\s+/g,' ').trim();
    if (j.pmcid) j.pmcid = j.pmcid.replace(/[^0-9]/g,'');
    if (j.pmid) j.pmid = j.pmid.replace(/[^0-9]/g,'');
    if (j.doi) j.doi = j.doi.replace(/ /g,''); // also translate from url encoding? Saw one from wellcome with a %2F in it...
    var proc = {doi:j.doi,pmcid:j.pmcid,pmid:j.pmid,title:j.title,refresh:refresh};
    var result = lantern_results.findByIdentifier(proc,refresh);
    if (result) {
      job.list[i].process = result._id;
    } else {
      var process = lantern_processes.findByIdentifier(proc);
      process ? job.list[i].process = process._id : job.list[i].process = lantern_processes.insert(proc);
    }
  }
  if (job.list.length === 0) job.done = true; // bit pointless submitting empty jobs, but theoretically possible. Could make impossible...
  job.new = false;
  if (jid !== undefined) {
    lantern_jobs.update(jid,{$set:job});
  } else {
    jid = lantern_jobs.insert(job);
  }
  if (job.email) {
    var jor = job.name ? job.name : jid;
    var text = 'Hi ' + job.email + '\n\nThanks very much for submitting your processing job ' + jor + '.\n\n';
    text += 'You can track the progress of your job at ';
    // TODO this bit should depend on user group permissions somehow
    // for now we assume if a signed in user then lantern, else wellcome
    if ( job.wellcome ) {
      text += 'https://compliance.cottagelabs.com#';
    } else if ( Meteor.settings.dev ) {
      text += 'http://lantern.test.cottagelabs.com#';
    } else {
      text += 'https://lantern.cottagelabs.com#';
    }
    text += jid;
    text += '\n\nThe Cottage Labs team\n\n';
    text += 'P.S This is an automated email, please do not reply to it.'
    CLapi.internals.sendmail({
      to:job.email,
      subject:'Job ' + jor + ' submitted successfully',
      text:text
    });
  }
  return jid;
}

CLapi.internals.service.lantern.process = function(processid) {
  // process a job from the lantern_processes job list
  var proc = lantern_processes.findOne(processid);
  if (!proc) return false;
  lantern_processes.update(proc._id, {$set:{processing:true}});

  // the result object to build, all the things we want to know
  var result = {
    '_id': proc._id,
    pmcid: proc.pmcid, // identifiers
    pmid: proc.pmid,
    doi: proc.doi,
    title: proc.title, // title of the article
    journal: {
      in_doaj: false,
      title: undefined,
      issn: undefined,
      eissn: undefined // do we want eissn separate from issn? for now just uses issn
    },
    publisher: undefined,
    confidence: 0, // 1 if matched on ID, 0.9 if title to 1 result, 0.7 if title to multiple results, 0 if unknown article
    in_epmc: false, // set to true if found
    is_aam: false, // set to true if is an eupmc author manuscript
    is_oa: false, // set to true if eupmc or other source says is oa
    aheadofprint: undefined, // if pubmed returns a date for this, it will be a date
    has_fulltext_xml: false, // set to true if oa and in epmc and can retrieve fulltext xml from eupmc rest API url
    licence: 'unknown', // what sort of licence this has - should be a string like "cc-by"
    epmc_licence: 'unknown', // the licence in EPMC, should be a string like "cc-by"
    licence_source: 'unknown', // where the licence info came from
    epmc_licence_source: 'unknown', // where the EPMC licence info came from (fulltext xml, EPMC splash page, etc.)
    romeo_colour: undefined, // the sherpa romeo colour
    embargo: undefined, // embargo data from romeo
    archiving: undefined, // sherpa romeo archiving data
    author: [], // eupmc author list if available (could look on other sources too?)
    in_core: 'unknown',
    repositories: [], // where CORE says it is. Should be list of objects
    grants:[], // a list of grants, probably from eupmc for now
    provenance: [] // list of things that were done
  };
  
  // search eupmc by (in order) pmcid, pmid, doi, title
  // check epmc for the record https://github.com/CottageLabs/lantern-api/blob/develop/service/workflow.py#L294
  var _formatepmcdate = function(date) {
    // try to format an epmc date which could really be any string. Some we will get wrong.
    try {
      date = date.replace(/\//g,'-');
      if (date.indexOf('-') !== -1) {
        if (date.length < 11) {
          var dp = date.split('-');
          if (dp.length === 3) {
            if (date.indexOf('-') < 4) {
              // assume date is like 01-10-2006
              return dp[2] + '-' + dp[1] + '-' + dp[0] + 'T00:00:00Z';
            } else {
              // assume date is like 2006-10-01
              return date + 'T00:00:00Z';            
            }
          } else if ( dp.length === 2 ) {
            // could be date like 2006-01 or 01-2006
            if (date.indexOf('-') < 4) {
              return dp[1] + dp[0] + date + '-01T00:00:00Z';
            } else {
              return date + '-01T00:00:00Z';
            }
          } else {
            return date;
          }
        } else {
          // what else could be tried?
          return date;
        }
      } else {
        var dateparts = date.replace(/  /g,' ').split(' ');
        var yr = dateparts[0].toString();
        var mth = dateparts.length > 1 ? dateparts[1] : 1;
        if ( isNaN(parseInt(mth)) ) {
          var mths = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
          var tmth = mth.toLowerCase().substring(0,3);
          if (mths.indexOf(tmth) !== -1) {
            mth = mths.indexOf(tmth) + 1;
          } else {
            mth = "01";
          }
        } else {
          mth = parseInt(mth);
        }
        mth = mth.toString();
        if (mth.length === 1) mth = "0" + mth;
        var dy = dateparts.length > 2 ? dateparts[2].toString() : "01";
        if (dy.length === 1) dy = "0" + dy;
        date = yr + '-' + mth + '-' + dy + 'T00:00:00Z';
        return date;
      }
    } catch(err) {
      return date;
    }
  }
  var identtypes = ['pmcid','pmid','doi','title'];
  var eupmc;
  for ( var i in identtypes ) {
    if ( eupmc === undefined ) {
      var st = identtypes[i];
      if ( proc[st] ) {
        var stt = st;
        var prst = proc[st];
        if (stt === 'title') {
          stt = 'search';
          prst = 'TITLE:"' + prst.replace('"','') + '"';
        }
        if (stt === 'pmcid') stt = 'pmc';
        var res = CLapi.internals.use.europepmc[stt](prst);
        if (res.data) {
          if (res.data.id && stt !== 'search') {
            eupmc = res.data;
            result.confidence = 1;
          } else if (stt === 'search') {
            if (res.total && res.total === 1) {
              eupmc = res.data[0];
              result.confidence = 0.9; // exact title match
            } else {
              // try a fuzzy match
              prst = prst.replace(/"/g,'');
              var res2 = CLapi.internals.use.europepmc[stt](prst);
              if (res2.total && res2.total === 1) {
                eupmc = res2.data[0];
                result.confidence = 0.7;
              }
            }
          }
        }
      }
    }
  }
  if (eupmc !== undefined) {
    if (eupmc.pmcid && result.pmcid !== eupmc.pmcid) {
      result.pmcid = eupmc.pmcid;
      result.provenance.push('Added PMCID from EUPMC');
    }
    if (eupmc.pmid && result.pmid !== eupmc.pmid) {
      result.pmid = eupmc.pmid;
      result.provenance.push('Added PMID from EUPMC');
    }
    if (eupmc.doi && result.doi !== eupmc.doi) {
      result.doi = eupmc.doi;
      result.provenance.push('Added DOI from EUPMC');
    }
    if (eupmc.title && !result.title) {
      result.title = eupmc.title;
      result.provenance.push('Added article title from EUPMC');
    }
    if (eupmc.inEPMC === 'Y') {
      result.in_epmc = true;
      result.provenance.push('Confirmed is in EUPMC');
    }
    if (eupmc.isOpenAccess === 'Y') {
      result.is_oa = true;
      result.provenance.push('Confirmed is open access from EUPMC');
    }
    if (eupmc.journalInfo && eupmc.journalInfo.journal ) {
      if ( eupmc.journalInfo.journal.title ) {
        result.journal.title = eupmc.journalInfo.journal.title; // completes oacwellcome issue 93
        result.provenance.push('Added journal title from EUPMC');
      }
      if ( eupmc.journalInfo.journal.essn) {
        result.journal.eissn = eupmc.journalInfo.journal.essn;
        result.provenance.push('Added eissn from EUPMC');
      }
      if ( eupmc.journalInfo.journal.issn ) {
        result.journal.issn = eupmc.journalInfo.journal.issn;
        result.provenance.push('Added issn from EUPMC');
      }
    }
    if (eupmc.grantsList && eupmc.grantsList.grant) {
      result.grants = eupmc.grantsList.grant;
      result.provenance.push('Added grants data from EUPMC');
    }
    // some dates that wellcome want - dateofpublication appears to be what they prefer
    //if (eupmc.journalInfo && eupmc.journalInfo.printPublicationDate) result.journal.printPublicationDate = eupmc.journal.printPublicationDate;
    if (eupmc.journalInfo && eupmc.journalInfo.dateOfPublication) {
      result.journal.dateOfPublication = _formatepmcdate(eupmc.journalInfo.dateOfPublication);
      result.provenance.push('Added date of publication from EUPMC');
    }
    if (eupmc.electronicPublicationDate) {
      result.electronicPublicationDate = _formatepmcdate(eupmc.electronicPublicationDate);
      result.provenance.push('Added electronic publication date from EUPMC');
    } else {
      result.electronicPublicationDate = 'Unavailable';
    }

    var ft_envelope;
    if (result.is_oa && result.in_epmc) ft_envelope = CLapi.internals.use.europepmc.fulltextXML(undefined, eupmc);
    if (ft_envelope && !ft_envelope.fulltext && result.pmcid) ft_envelope = CLapi.internals.use.europepmc.fulltextXML(result.pmcid);

    if (ft_envelope && ft_envelope.error) {
      if (ft_envelope.error == 404) {
        result.provenance.push('Not found in EUPMC when trying to fetch full text XML.');
      } else {
        result.provenance.push('Encountered an error while retrieving the EUPMC full text XML. One possible reason is EUPMC being temporarily unavailable.');
      }
    }
    
    var ft = ft_envelope ? ft_envelope.fulltext : false;
    if (ft) {
      result.has_fulltext_xml = true;
      result.provenance.push('Confirmed fulltext XML is available from EUPMC');
    }
    var lic = CLapi.internals.use.europepmc.licence(result.pmcid,eupmc,ft);
    if (lic !== false) {
      result.licence = lic.licence;
      result.epmc_licence = lic.licence;
      result.licence_source = lic.source;
      result.epmc_licence_source = lic.source;
      var extrainfo = '';
      // add the exact licence type here since for wellcome this is now lost under non-standard-licence translation
      if (lic.matched) {extrainfo += ' The bit that let us determine the licence was: ' + lic.matched + ' .';}
      if (lic.matcher) {extrainfo += ' If licence statements contain URLs we will try to find those in addition to ' +
        'searching for the statement\'s text. Here the entire licence statement was: ' + lic.matcher + ' .';}
      result.provenance.push('Added EPMC licence (' + result.epmc_licence + ') from ' + lic.source + '.' + extrainfo);

      // result.licence and result.licence_source can be overwritten later by
      // the academic licence detection (what OAG used to do), but we will keep the
      // EPMC information separately.
    }
    if (eupmc.authorList && eupmc.authorList.author) {
      result.author = eupmc.authorList.author;
      result.provenance.push('Added author list from EUPMC');
    }
    if (result.in_epmc) {
      var aam = CLapi.internals.use.europepmc.authorManuscript(result.pmcid,eupmc);
      if (aam === false) {
        result.is_aam = false;
        result.provenance.push('Checked author manuscript status in EUPMC, found no evidence of being one');
      } else if (aam.startsWith('Y')) {
        result.is_aam = true;
        result.provenance.push('Checked author manuscript status in EUPMC, returned ' + aam);
      } else if (aam === 'unknown-not-found-in-epmc') {
        result.is_aam = 'unknown';
        result.provenance.push('Unable to locate Author Manuscript information in EUPMC - could not find the article in EUPMC.');
      } else if (aam === 'unknown-error-accessing-epmc') {
        result.is_aam = 'unknown';
        result.provenance.push('Error accessing EUPMC while trying to locate Author Manuscript information. EUPMC could be temporarily unavailable.');
      } else {
        result.is_aam = 'unknown';
      }
    }
  } else {
    result.is_aam = "not applicable";
    result.provenance.push('Unable to locate article in EPMC.')
  }

  if (!result.doi && !result.pmid && !result.pmcid) {
    result.provenance.push('Unable to obtain DOI, PMID or PMCID for this article. Compliance information may be severely limited.');
  }

  if (result.doi) {
    var crossref = CLapi.internals.use.crossref.works.doi(result.doi);
    if (crossref.status === 'success') {
      var c = crossref.data;
      if (!result.confidence) {
        // Do not overwrite previously set confidence, if any.
        // The only other place which sets confidence is the EUPMC lookup. If it already set it to 1, then we don't
        // need to do anything. But if a title-only search (i.e. less confident lookup) set it to < 1, then we will
        // wrongly overwrite it here.
        result.confidence = 1;
      }
      result.publisher = c.publisher; // completes oacwellcome issue 90
      result.provenance.push('Added publisher name from Crossref');
      if (!result.journal.issn && c.ISSN && c.ISSN.length > 0) {
        result.journal.issn = c.ISSN[0];
        result.provenance.push('Added ISSN from Crossref');
      }
      if (!result.journal.title && c['container-title'] && c['container-title'].length > 0) {
        result.journal.title = c['container-title'][0];
        result.provenance.push('Added journal title from Crossref');
      }
      if (!result.author && c.author) {
        result.author = c.author; // format like eupmc author list?
        result.provenance.push('Added author list from Crossref');
      }
      if (!result.title && c.title && c.title.length > 0) {
        result.title = c.title[0]; 
        result.provenance.push('Added article title from Crossref');
      }
    } else {
      result.provenance.push('Unable to obtain information about this article from Crossref.')
    }
    
    // look up core to see if it is in there (in fulltext or not?)
    // should we use BASE / dissemin as well / instead?)
    if (result.doi) {
      var core = CLapi.internals.use.core.articles.doi(result.doi);
      if (core.data && core.data.id) {
        result.in_core = true;
        result.provenance.push('Found DOI in CORE');
        var cc = core.data;
        if (!result.author && cc.authors) {
          result.author = cc.author; // format like eupmc author list?      
          result.provenance.push('Added authors from CORE');
        }
        if (cc.repositories && cc.repositories.length > 0) {
          for ( var ci in cc.repositories ) {
            var rep = cc.repositories[ci];
            if (rep.uri && rep.uri.length > 0) {
              rep.url = rep.uri;
              delete rep.uri;
            } else {
              try {
                var repo = CLapi.internals.use.opendoar.search(rep.name);
                if (repo.status === 'success' && repo.total === 1 && repo.data[0].url) {
                  rep.url = repo.data[0].url;
                  // or is ourl or uurl more appropriate? See https://dev.api.cottagelabs.com/use/opendoar/search/Aberdeen%2520University%2520Research%2520Archive
                  result.provenance.push('Added repo base URL from OpenDOAR');                  
                } else {
                  result.provenance.push('Searched OpenDOAR but could not find repo and/or URL');                  
                }
              } catch (err) {
                result.provenance.push('Tried but failed to search OpenDOAR for repo base URL');          
              }
            }
            if (rep.id) delete rep.id;
            rep.fulltexts = [];
            if ( cc.fulltextUrls ) {
              for ( var f in cc.fulltextUrls ) {
                var fu = cc.fulltextUrls[f];
                console.log(fu);
                if ( fu.indexOf('core.ac.uk') === -1 ) {
                  try {
                    //var exists = Meteor.http.call('GET',fu); // will throw an error if cannot be accessed
                    var resolved;
                    try {
                      resolved = fu;
                      //resolved = fu.indexOf('dx.doi.org') !== -1 ? CLapi.internals.academic.doiresolve(fu) : CLapi.internals.academic.redirect_chain_resolve(fu);
                    } catch (err) {
                      resolved = fu;
                    }
                    if (rep.fulltexts.indexOf(resolved) === -1 && (!rep.url || ( rep.url && resolved.indexOf(rep.url.replace('http://','').replace('https://','').split('/')[0]) !== -1 ) ) ) rep.fulltexts.push(resolved);
                  } catch (err) {}
                }
              }
            }
            result.repositories.push(rep); // add URL here - does not seem to be in CORE data
          }
          result.provenance.push('Added repositories that CORE claims article is available from');
        }
        if (!result.title && cc.title) {
          result.title = cc.title;
          result.provenance.push('Added title from CORE');
        }
        // anything useful from fulltextUrls key?
        // can is_oa be inferred from being in CORE? probably not reliably... 
        // maybe if has any fulltextUrls it is, but some don't have such URLs even if they clearly should exist
      } else {
        result.in_core = false;
        result.provenance.push('Could not find DOI in CORE');
      }
    }
  } else {
    result.provenance.push('Not attempting Crossref or CORE lookups - do not have DOI for article.');
  }
  console.log('Finished lantern processing of CORE data')

  // use grist API from EUPMC to look up PI name of any grants present
  if ( result.grants.length > 0 ) {
    for ( var g in result.grants ) {
      var gr = result.grants[g];
      if (gr.grantId) {
        var grid = gr.grantId;
        if (gr.agency && gr.agency.toLowerCase().indexOf('wellcome') !== -1 ) {
          grid = grid.split('/')[0];
          console.log('Lantern simplified ' + gr.grantId + ' to ' + grid + ' for Grist API call');
        }
        var gres = CLapi.internals.use.grist.grant_id(grid);
        if (gres.total && gres.total > 0 && gres.data.Person) {
          var ps = gres.data.Person;
          var pid = '';
          if (ps.Title) pid += ps.Title + ' ';
          if (ps.GivenName) pid += ps.GivenName + ' ';
          if (!ps.GivenName && ps.Initials) pid += ps.Initials + ' ';
          if (ps.FamilyName) pid += ps.FamilyName;
          result.grants[g].PI = pid;
          result.provenance.push('Found Grant PI for ' + grid + ' via Grist API');
        }
      } else {
        result.provenance.push('Tried but failed to find Grant PI via Grist API');
      }
    }
  } else {
    result.provenance.push('Not attempting Grist API grant lookups since no grants data was obtained from EUPMC.');
  }
  
  if (result.pmid && !result.in_epmc) {
    result.aheadofprint = CLapi.internals.use.pubmed.aheadofprint(result.pmid);
    if (result.aheadofprint !== false) {
      result.provenance.push('Checked ahead of print status on pubmed, date found ' + result.aheadofprint);      
    } else {
      result.provenance.push('Checked ahead of print status on pubmed, no date found');
    }
  } else {
    var msg = 'Not checking ahead of print status on pubmed.';
    if (!result.pmid) {msg += ' We don\'t have the article\'s PMID.';}
    if (result.in_epmc) {msg += ' The article is already in EUPMC.';}
    result.provenance.push(msg);
  }
  result.aheadofprint = !result.in_epmc && !result.pmid ? 'Unknown' : 'Not applicable';
  
  if ( result.journal.issn ) {
    // is it in doaj
    var doaj = CLapi.internals.use.doaj.journals.issn(result.journal.issn);
    if (doaj.status === 'success') {
      result.journal.in_doaj = true;
      result.provenance.push('Confirmed journal is listed in DOAJ');
      if (!result.publisher && doaj.data.bibjson.publisher) result.publisher = doaj.data.bibjson.publisher;
      if (!result.journal.title && doaj.data.bibjson.title) result.journal.title = doaj.data.bibjson.title;
    } else {
      result.provenance.push('Could not find journal in DOAJ');      
    }
    
    // what are the policies from sherpa romeo
    var romeo = CLapi.internals.use.sherpa.romeo.search({issn:result.journal.issn});
    if ( romeo.status === 'success') {
      var journal, publisher;
      try {
        journal = romeo.data.journals[0].journal[0];
      } catch(err) {} // sometimes there is no publisher info in romeo, so adding this catch too just in case there is ever no journal info...
      try {
        publisher = romeo.data.publishers[0].publisher[0];
      } catch(err) {}
      // it is possible to have no publisher info, so catch the error
      // see http://www.sherpa.ac.uk/romeo/api29.php?ak=Z34hA6x7RtM&issn=1941-2789&
      if (!result.journal.title) {
        if (journal && journal.jtitle && journal.jtitle.length > 0) {
          result.journal.title = journal.jtitle[0];
          result.provenance.push('Added journal title from Sherpa Romeo');
        } else {
          result.provenance.push('Tried, but could not add journal title from Sherpa Romeo.');
        }
      }
      if (!result.publisher) {
        if (publisher && publisher.name && publisher.name.length > 0) {
          result.publisher = publisher.name[0];
          result.provenance.push('Added publisher from Sherpa Romeo');
        } else {
          result.provenance.push('Tried, but could not add publisher from Sherpa Romeo.');
        }
      }
      if (publisher) result.romeo_colour = publisher.romeocolour[0];
      result.embargo = {preprint:false,postprint:false,pdf:false};
      result.archiving = {preprint:false,postprint:false,pdf:false};
      for ( var k in result.embargo ) {
        var main = k.indexOf('pdf') !== -1 ? k + 's' : 'pdfversion';
        var stub = k.replace('print','');
        if ( publisher && publisher[main]) {
          if (publisher[main][0][stub+'restrictions']) {
            for ( var p in publisher[main][0][stub+'restrictions'] ) {
              if (publisher[main][0][stub+'restrictions'][p][stub+'restriction']) {
                result.embargo[k] === false ? result.embargo[k] = '' : result.embargo[k] += ',';
                result.embargo[k] += publisher[main][0][stub+'restrictions'][p][stub+'restriction'][0].replace(/<.*?>/g,'');
              }
            }
          }
          if (publisher[main][0][stub+'archiving']) result.archiving[k] = publisher[k+'s'][0][stub+'archiving'][0];
        }
      }
      result.provenance.push('Added embargo and archiving data from Sherpa Romeo');
      // can we infer licence or is_oa from sherpa data?
    } else {
      result.provenance.push('Unable to add any data from Sherpa Romeo.')
    }
  } else {
    result.provenance.push('Not attempting to add any data from Sherpa Romeo - don\'t have a journal ISSN to use for lookup.')
  }
  
  // if license could not be found yet, call academic/licence to get info from the splash page
  if (!result.licence || result.licence === 'unknown' || (result.licence != 'cc-by' && result.licence != 'cc-zero')) {
    result.publisher_licence_check_ran = true;
    console.log('Running publisher academic licence detection');
    var url;
    if (result.doi) {
      url = CLapi.internals.academic.doiresolve(result.doi);
    } else if ( result.pmcid ) {
      // TODO eupmc splash page would already be checked if necessary for anything with a pmcid
      // so this should only return a URL if we can resolve one to a non-eupmc page
      //url = 'http://europepmc.org/articles/PMC' + result.pmcid; 
    } else if ( result.pmid ) {
      // TODO need to check where resolve would resolve this to - need publisher page, NOT epmc page and probably not pubmed page either
      // PMIDs may not be open, so really need to check full urls list
      url = CLapi.internals.academic.resolve('pmid' + result.pmid).url;
    }
    if (url && url.length > 1) {
      var lic = CLapi.internals.academic.licence(url,false,undefined,undefined,undefined,true);
      if (lic.licence && lic.licence !== 'unknown') {
        result.licence = lic.licence;
        result.licence_source = 'publisher_splash_page';
        // TODO Wellcome with their split licence column ended up needing to know the publisher licence separately, but
        // this duplicates (some) information with the .licence result field, probably worth refactoring.
        result.publisher_licence = lic.licence;
        var extrainfo = '';
        if (lic.matched) {extrainfo += ' The bit that let us determine the licence was: ' + lic.matched + ' .';}
        if (lic.matcher) {extrainfo += ' If licence statements contain URLs we will try to find those in addition to ' +
          'searching for the statement\'s text. Here the entire licence statement was: ' + lic.matcher + ' .';}
        result.provenance.push('Added licence (' + result.publisher_licence + ') via article publisher splash page lookup to ' + lic.resolved + ' ' + extrainfo);
      } else {
        result.publisher_licence = 'unknown';
        result.provenance.push('Unable to retrieve licence data via article publisher splash page lookup.');
        if (lic.large) result.provenance.push('Retrieved content was very long, so was contracted to 500,000 chars from start and end to process.');
      }
    } else {
      result.provenance.push('Unable to retrieve licence data via article publisher splash page - cannot obtain a suitable URL to run the licence detection on.');
    }
  } else {
    result.provenance.push('Not attempting to retrieve licence data via article publisher splash page lookup.');
    result.publisher_licence_check_ran = false;
  }
  if (!result.publisher_licence_check_ran && result.publisher_licence !== 'unknown') {
    // Did we look up a separate licence on the publisher website? If so, we want to display it.
    // But if we've branched into here, then we did not do a separate look up
    // (i.e. we were happy with EPMC results). So the "Publisher Licence" column should say "not applicable".

    // There is one exception: if we did a publisher site licence lookup but got nothing, then obviously
    // Publisher Licence is applicable, and should say "unknown". We don't want to change an "unknown" into a
    // "not applicable".
    result.publisher_licence = "not applicable";
  }
  if (result.publisher_licence === undefined) result.publisher_licence = 'unknown';
  // if the licence starts with cc-, leave it. Otherwise set to non-standard-licence. TODO should this apply even to non-wellcome ones?
  if (result.epmc_licence !== undefined && result.epmc_licence !== 'unknown' && !result.epmc_licence.startsWith('cc-')) {
    result.epmc_licence = 'non-standard-licence';
  }
  if (result.publisher_licence !== undefined && result.publisher_licence !== 'unknown' && result.publisher_licence !== "not applicable" && !result.publisher_licence.startsWith('cc-')) {
    result.publisher_licence = 'non-standard-licence';
  }
  
  result.compliance = CLapi.internals.service.lantern.compliance(result);
  result.score = CLapi.internals.service.lantern.score(result);
  
  lantern_results.insert(result);
  lantern_processes.remove(proc._id);
  
  return result; // return result or just confirm process is done?
}
CLapi.internals.service.lantern.nextProcess = function() {
  // search for processes not already processing, sorted by descending created data
  // add any sort of priority queue checking?
  var p = lantern_processes.findOne({processing:{$not:{$eq:true}}},{sort:{createdAt:-1}});
  if (p) {
    console.log(p._id);
    return CLapi.internals.service.lantern.process(p._id);
  } else {
    console.log('No lantern processes available');
    return false
  }
}

CLapi.internals.service.lantern.progress = function(jobid) {
  // given a job ID, find out how many of the identifiers in the job we have an answer for
  // return a percentage figure for how many have been done
  var job = lantern_jobs.findOne(jobid);
  if (job) {
    var p;
    if (job.done) {
      p = 100;
    } else if (job.new === true) {
      p = 0;
    } else {
      var total = job.list.length;
      var count = 0;
      for ( var i in job.list ) {
        var found = lantern_results.findOne(job.list[i].process);
        // could add a check for OTHER results with similar IDs - but shouldn't be any, and would have to re-sanitise the IDs
        if ( found ) {
          count += 1;
        }
      }
      p = count/total * 100;      
      if ( p === 100 ) {
        lantern_jobs.update(job._id, {$set:{done:true}});
        var jor = job.name ? job.name : job._id;
        var text = 'Hi ' + job.email + '\n\nYour processing job ' + jor + ' is complete.\n\n';
        text += 'You can now download the results of your job at ';
        // TODO this bit should depend on user group permissions somehow
        // for now we assume if a signed in user then lantern, else wellcome
        if ( job.wellcome ) {
          text += 'https://compliance.cottagelabs.com#';
        } else if ( Meteor.settings.dev ) {
          text += 'http://lantern.test.cottagelabs.com#';
        } else {
          text += 'https://lantern.cottagelabs.com#';
        }
        text += job._id;
        text += '\n\nThe Cottage Labs team\n\n';
        text += 'P.S This is an automated email, please do not reply to it.'
        CLapi.internals.sendmail({
          to:job.email,
          subject:'Job ' + jor + ' completed successfully',
          text:text
        });
      }
    }
    return {createdAt:job.createdAt,total:job.list.length,progress:p,name:job.name,email:job.email,_id:job._id,new:job.new};
  } else {
    return false;
  }
}

CLapi.internals.service.lantern.todo = function(jobid) {
  // given a job ID, return the parts still to do
  var job = lantern_jobs.findOne(jobid);
  if (job) {
    if (job.done) {
      return [];
    } else {
      var todos = [];
      for ( var i in job.list ) {
        if ( !lantern_results.findOne(job.list[i].process) ) todos.push(job.list[i]);
      }
      return todos;
    }
  } else {
    return false;
  }
}

CLapi.internals.service.lantern.results = function(jobid,format) {
  var job = lantern_jobs.findOne(jobid);
  if (job) {
    var results = [];
    for ( var i in job.list ) {
      var ji = job.list[i];
      var found = lantern_results.findOne(ji.process);
      if ( found ) {
        for ( var lf in ji) {
          if (!found[lf]) found[lf] = ji[lf];
        }
        if (format) found = CLapi.internals.service.lantern.format(found);
        results.push(found);
      }
    }
    return results;
  } else {
    return false;
  }
}

CLapi.internals.service.lantern.compliance = function(result,policies) {
  if (policies === undefined) policies = ['wellcome'];
  var compliance = {};
  
  if (policies.indexOf('wellcome') !== -1) {
    compliance.wellcome_standard = {compliant:false};
    compliance.wellcome_deluxe = {compliant:false};
    var epmc_compliance_lic = result.epmc_licence ? result.epmc_licence.toLowerCase().replace(/ /g,'') : '';
    var epmc_lics = epmc_compliance_lic === 'cc-by' || epmc_compliance_lic === 'cc0' || epmc_compliance_lic === 'cc-zero' ? true : false;
    if (result.in_epmc && (result.is_aam || epmc_lics)) compliance.wellcome_standard.compliant = true;
    if (result.in_epmc && result.is_aam) compliance.wellcome_deluxe.compliant = true;
    if (result.in_epmc && epmc_lics && result.is_oa) compliance.wellcome_deluxe.compliant = true;
  }
  return compliance;
}

CLapi.internals.service.lantern.score = function(result) {
  // TODO calculate a lantern "open" score for this article
  return 100;
}

CLapi.internals.service.lantern.format = function(result) {
  var s = {
    doi:'DOI',
    pmcid:'PMCID',
    pmid: 'PMID',
    publisher: 'Publisher',
    title: 'Article_title',
    licence: 'Licence',
    epmc_licence: 'EPMC licence',
    publisher_licence: "Publisher licence",
    electronicPublicationDate: 'Electronic publication date',
    in_epmc: 'Fulltext in EPMC',
    has_fulltext_xml: 'XML fulltext',
    is_aam: 'Author manuscript',
    is_oa: 'Open access',
    confidence: 'Correct article confidence',
    licence_source: 'Licence source',
    epmc_licence_source: 'EPMC licence source',
    romeo_colour: 'Sherpa romeo colour',
    aheadofprint: 'Ahead of print',
    in_core: 'In CORE',
    publisher_licence_check_ran: false,
    createdAt: false,
    process: false,
    result: false,
    '_id': false
  }
  if ( result.provenance ) {
    result.Provenance = '';
    var fst = true;
    for ( var p in result.provenance ) {
      if (fst) {
        fst = false;
      } else {
        result.Provenance += '\r\n';
      }
      result.Provenance += result.provenance[p];
    }
    delete result.provenance;
  }
  result['Publication Date'] = 'Unavailable';
  if ( result.journal ) {
    if (result.journal.dateOfPublication !== undefined) result['Publication Date'] = result.journal.dateOfPublication;
    result['Journal title'] = result.journal.title;
    result.ISSN = result.journal.issn;
    if (result.journal.eissn && ( !result.ISSN || result.ISSN.indexOf(result.journal.eissn) === -1 ) ) result.ISSN += ', ' + result.journal.eissn;
    if ( result.journal.in_doaj === true ) {
      result['Journal Type'] = 'oa';
    } else {
      result['Journal Type'] = 'hybrid';
    }
    delete result.journal;
  }
  if ( result.author && result.author.length > 0 ) {
    result['Author(s)'] = '';
    var first = true;
    for ( var r in result.author ) {
      if (first) {
        first = false;
      } else {
        result['Author(s)'] += ', ';
      }
      var ar = result.author[r];
      if ( ar.fullName ) result['Author(s)'] += ar.fullName;
      //if ( ar.affiliation) result['Author(s)'] += ' - ' + ar.affiliation; disabled by request of Cecy
      // TODO add some more IFs here depending on author structure, unless altered above to match eupmc structure
    }
    delete result.author;
  }
  if ( result.grants ) {
    var grants = [];
    for ( var w in result.grants) {
      var g = result.grants[w];
      if (g.agency && g.agency.toLowerCase().indexOf('wellcome') !== -1) {
        grants.unshift(g);
      } else {
        grants.push(g);
      }
    }
    for ( var gr in grants ) {
      if (grants[gr] !== undefined) {
        result['Grant ' + (parseInt(gr)+1)] = grants[gr].grantId;
        result['Agency ' + (parseInt(gr)+1)] = grants[gr].agency;
        result['PI ' + (parseInt(gr)+1)] = grants[gr].PI ? grants[gr].PI : 'unknown';
      }
    }
    delete result.grants;
  }
  if (result.embargo) {
    if (result.embargo.preprint) result['Preprint Embargo'] = result.embargo.preprint;
    if (result.embargo.postprint) result['Postprint Embargo'] = result.embargo.postprint;
    if (result.embargo.pdf) result['Publishers Copy Embargo'] = result.embargo.pdf;
    delete result.embargo;
  }
  if (result.archiving) {
    if (result.archiving.preprint) result['Preprint Self-archiving Policy'] = result.archiving.preprint;
    if (result.archiving.postprint) result['Postprint Self-archiving Policy'] = result.archiving.postprint;
    if (result.archiving.pdf) result['Publishers Copy Self-Archiving Policy'] = result.archiving.pdf;
    delete result.archiving;    
  }
  if (result.repositories) {
    result['Repositories'] = '';
    result['Repository URLs'] = '';
    result['Repository fulltext URLs'] = '';
    result['Repository OAI IDs'] = '';
    for ( var rr in result.repositories ) {
      if (result.repositories[rr].name) {
        if (result.Repositories !== '') result.Repositories += '\r\n';
        result.Repositories += result.repositories[rr].name;
      }
      if (result.repositories[rr].url) {
        if (result['Repository URLs'] !== '') result['Repository URLs'] += '\r\n';
        result['Repository URLs'] += result.repositories[rr].url;
      }
      if (result.repositories[rr].oai) {
        if (result['Repository OAI IDs'] !== '') result['Repository OAI IDs'] += '\r\n';
        result['Repository OAI IDs'] += result.repositories[rr].oai;
      }
      if (result.repositories[rr].fulltexts) {
        for ( var f in result.repositories[rr].fulltexts ) {
          if (result['Repository fulltext URLs'] !== '') result['Repository fulltext URLs'] += '\r\n';
          result['Repository fulltext URLs'] += result.repositories[rr].fulltexts[f];
        }
      }
    }
    delete result.repositories;    
  }
  if (result.compliance) {
    for ( var c in result.compliance ) {
      var pol = result.compliance[c].compliant;
      result[c.replace(/_/g,' ')[0].toUpperCase() + c.replace(/_/g,' ').substring(1) + ' compliant?'] = pol === true ? 'TRUE' : 'FALSE';
    }
  }
  for ( var key in result ) {
    if ( result[key] === true ) result[key] = 'TRUE';
    if ( result[key] === false ) result[key] = 'FALSE';
    if ( result[key] === undefined || result[key] === null ) result[key] = 'unknown';
    if ( s[key] !== undefined ) {
      if (s[key] !== false) result[s[key]] = result[key];
      delete result[key];
    }
  }
  if (result.pmcid && result.pmcid.toLowerCase().indexOf('pmc') !== 0) result.pmcid = 'PMC' + result.pmcid;
  return result;
}

CLapi.internals.service.lantern.alertdone = function() {
  var j = lantern_jobs.find({done:{$not:{$eq:true}}});
  var ret = 0;
  j.forEach(function(job) {
    var progress = CLapi.internals.service.lantern.progress(job._id);
    if (progress && progress.progress === 100) {
      ret += 1;
    }
  });
  return ret;
}

CLapi.internals.service.lantern.alertstuck = function() {
  var prev = lantern_meta.findOne('previous_processing_check');
  if (prev === undefined) {
    prev = {_id:'previous_processing_check',list:[],same:false,since:0,howmany:0,change:0};
    lantern_meta.insert(prev);
  }
  if (prev.howmany === undefined) prev.howmany = 0;
  var howmany = lantern_processes.find().count();
  prev.change = howmany - prev.howmany;
  prev.howmany = howmany;
  var procs = lantern_processes.find({processing:{$eq:true}}).fetch();
  var currents = [];
  var same = true;
  for ( var p in procs ) {
    currents.push(procs[p]._id);
    if ( prev.list.indexOf(procs[p]._id) === -1 ) same = false;
  }
  prev.since = same ? prev.since + 15 : 0;
  prev.same = same;
  prev.list = currents;
  lantern_meta.update('previous_processing_check',{$set:prev});
  console.log("Stuck lantern processes check")
  console.log(prev);
  var txt = ''
  if (same && currents.length !== 0 && prev.since >= 30) {
    txt = 'There appear to be ' + currents.length + ' processes stuck on the queue for at least ' + prev.since + ' minutes';
    txt += '\n\nResetting the processes may help, if you are sure you do not want to check the situation first:\n\n';
    txt += 'https://';
    if ( Meteor.settings.dev ) txt += 'dev.';
    txt += 'api.cottagelabs.com/service/lantern/processes/reset';
    CLapi.internals.sendmail({
      to:'sysadmin@cottagelabs.com',
      subject:'CL ALERT: Lantern processes stuck',
      text:txt
    });
    return true;
  } else if ( howmany !== 0 && procs.length === 0 && prev.change >= 0 ) {
    txt = 'There appear to be ' + howmany + ' processes in the system but there appear to be no processes running.';
    txt += '\n\nThe amount of processes has changed by ' + prev.change + ' since last check';
    txt += '\n\nResetting the processes is unlikely to help, but you can try, if you do not want to check the situation first:\n\n';
    txt += 'https://api.cottagelabs.com/service/lantern/processes/reset';
    CLapi.internals.sendmail({
      to:'sysadmin@cottagelabs.com',
      subject:'CL ALERT: Lantern processes may not be running',
      text:txt
    });
    return true;
  } else {
    return false;
  }
}

CLapi.internals.service.lantern.dropoldresults = function() {
  // search for results over 180 days old and delete them
  var d = Meteor.settings.cron.lantern_dropoldresults;
  var r = lantern_results.find({done:{$not:{$eq:true}}});
  var ret = 0;
  r.forEach(function(res) {
    lantern_results.remove(res._id);
    ret += 1;
  });
  return ret;
}

CLapi.internals.service.lantern.dropoldjobs = function() {
  // search for results over d days old and delete them
  var d = Meteor.settings.cron.lantern_dropoldjobs;
  var j = lantern_jobs.find({done:{$not:{$eq:true}}});
  var ret = 0;
  j.forEach(function(job) {
    lantern_jobs.remove(job._id);
    ret += 1;
  });
  return ret;
}

if ( Meteor.settings.cron.lantern_dropoldjobs ) {
  SyncedCron.add({
    name: 'lantern_dropoldjobs',
    schedule: function(parser) { return parser.recur().every(24).hour(); },
    job: CLapi.internals.service.lantern.dropoldjobs
  });
}
if ( Meteor.settings.cron.lantern_dropoldresults ) {
  SyncedCron.add({
    name: 'lantern_dropoldresults',
    schedule: function(parser) { return parser.recur().every(24).hour(); },
    job: CLapi.internals.service.lantern.dropoldresults
  });
}
if ( Meteor.settings.cron.lantern_alertstuck ) {
  SyncedCron.add({
    name: 'lantern_alertstuck',
    schedule: function(parser) { return parser.recur().every(15).minute(); },
    job: CLapi.internals.service.lantern.alertstuck
  });  
}
if ( Meteor.settings.cron.lantern_alertdone ) {
  SyncedCron.add({
    name: 'lantern_alertdone',
    schedule: function(parser) { return parser.recur().every(10).minute(); },
    job: CLapi.internals.service.lantern.alertdone
  });
}
if ( Meteor.settings.cron.lantern ) {
  SyncedCron.add({
    name: 'lantern',
    schedule: function(parser) { return parser.recur().every(1).second(); },
    job: CLapi.internals.service.lantern.nextProcess
  });
}
SyncedCron.config({utc:true}); // defaults to not utc, which caused cpu spike on 30/10/2016 0200 when clocks went back
SyncedCron.start(); // where should the cron starter go in the API code? - a generic startup section somewhere?


*/


