
// a set of useful tdm things to do on stuff

CLapi.addRoute('tdm', {
  get: {
    action: function() {
      return {status:'success', data: 'Do useful tdm things, so far includes levenshtein, keywords, and match'}
    }
  }
});

CLapi.addRoute('tdm/levenshtein', {
  get: {
    action: function() {
      if (this.queryParams.a && this.queryParams.b) {
        return CLapi.internals.tdm.levenshtein(this.queryParams.a,this.queryParams.b)
      } else {
        return {status: 'success', data:{info:'provide two query params called a and b which should be strings, get back the levenshtein distance'}}
      }
    }
  }
});

CLapi.addRoute('tdm/keywords', {
  get: {
    action: function() {
      // expect a url or a string of data, and indication if content should be converted from *ml or pdf
      var content;
      if ( this.queryParams.content ) {
        content = this.queryParams.content;
      } else if (this.queryParams.url) {
				var url = this.queryParams.url;
				if (url.indexOf('http') === -1) url = 'http://' + url;
        // resolve the URL
        if ( false ) { // check if we have seen this url before - if so the content should be in our index
        } else {
          // could just get whatever the URL is and save it as attachment into ES...
          if ( this.queryParams.format === 'text' ) {
            content = Meteor.http.call('GET',url).content;
          } else if ( this.queryParams.format === 'pdf' ) {
            content = CLapi.internals.convert.file2txt(url);
          } else {
            content = CLapi.internals.convert.xml2txt(url);
          }
          // save the content to the contentmine index. Save as attachment too?
        }
      }
      if (content && content.length > 1) {
        return {status: 'success', data: CLapi.internals.tdm.keywords(content)}
      } else {
        return {status: 'error', data: 'Sorry, could not get keywords from content'}
      }
    }
  }
});

CLapi.addRoute('tdm/extract', {
  get: {
    action: function() {
			var params = this.bodyParams;
			if (this.queryParams.url) params.url = this.queryParams.url;
			if (params.url.indexOf('http') === -1) params.url = 'http://' + params.url;
			if (this.queryParams.match && this.queryParams.match.indexOf(',') !== -1) {
				 params.matchers = decodeURIComponent(this.queryParams.match).split(',');
			} else if (this.queryParams.match) {
				params.matchers = [decodeURIComponent(this.queryParams.match)];
			}
			if (this.queryParams.lowercase) params.lowercase = true;
			if (this.queryParams.ascii) params.ascii = true;
			if (this.queryParams.convert) params.convert = this.queryParams.convert;
			if (this.queryParams.start) params.start = this.queryParams.start;
			if (this.queryParams.end) params.end = this.queryParams.end;
			return {status: 'success', data: CLapi.internals.tdm.extract(params)}
    }
  }
});

CLapi.addRoute('tdm/match', {
  get: {
    action: function() {
      // TODO: find things in a processing document or set of documents
      if ( this.queryParams.url || this.queryParams.set ) {
        var set;
        if ( this.queryParams.url) {
          CLapi.internals.contentmine.get(this.queryParams.url);
          set = [this.queryParams.url];
        } else {
          var s = contentmine_sets.findOne(this.queryParams.set);
          set = s.urls;
        }
        if (set) {
          for ( var ss in set ) {
            var u = set[ss];
          }
        } else {
          return {statusCode: 404, body: '404 not found'}
        }
      } else {
        return {status: 'success', data: {info: 'Match a URL or contentmine set (of URLs) against a given dictionary'} };
      }
    }
  }
});


CLapi.internals.tdm = {};

CLapi.internals.tdm.levenshtein = function(a,b) {
	function minimator(x, y, z) {
		if (x <= y && x <= z) return x;
		if (y <= x && y <= z) return y;
		return z;
	}

  var cost;
  var m = a.length;
  var n = b.length;

  // make sure a.length >= b.length to use O(min(n,m)) space, whatever that is
  if (m < n) {
    var c = a; a = b; b = c;
    var o = m; m = n; n = o;
  }

  var r = []; r[0] = [];
  for (var c = 0; c < n + 1; ++c) {
    r[0][c] = c;
  }

  for (var i = 1; i < m + 1; ++i) {
    r[i] = []; r[i][0] = i;
    for ( var j = 1; j < n + 1; ++j ) {
      cost = a.charAt( i - 1 ) === b.charAt( j - 1 ) ? 0 : 1;
      r[i][j] = minimator( r[i-1][j] + 1, r[i][j-1] + 1, r[i-1][j-1] + cost );
    }
  }
  
  var dist = r[ r.length - 1 ][ r[ r.length - 1 ].length - 1 ]
	return {status:'success',data:{distance:dist,detail:r}};
}

CLapi.internals.tdm.keywords = function(content,opts) {
  var gramophone = Meteor.npmRequire('gramophone');
  var keywords = gramophone.extract(content, opts);
	var res = [];
	if (opts) {
		for ( var i in keywords ) {
			var str = opts.score ? keywords[i].term : keywords[i];
			if (!opts.len || str.length >= opts.len) {
				if (!opts.max || i < opts.max) {
					res.push(keywords[i]);
				}
			}
		}
	} else {
		res = keywords;
	}
  return res;
}

CLapi.internals.tdm.extract = function(opts) {
	// opts expects url,content,matchers (a list, or singular "match" string),start,end,convert,format,lowercase,ascii

	if (opts.url && !opts.content) opts.content = CLapi.internals.academic.phantom(opts.url,undefined);

	var text;
	try {
		if (opts.convert) {
			text = CLapi.internals.convert.run(opts.url,opts.convert,'txt',opts.content);
		} else {
			text = opts.content;
		}
	} catch(err) {
		text = opts.content;
	}
	
	if (opts.match) opts.matchers = [opts.match];
	if (opts.start !== undefined) {
		var parts = text.split(opts.start);
		parts.length > 1 ? text = parts[1] : text = parts[0];
	}
	if (opts.end !== undefined) text = text.split(opts.end)[0];

	if (opts.lowercase) text = text.toLowerCase();
	if (opts.ascii) text = text.replace(/[^a-z0-9]/g,'');
	
	var res = {matched:0,matches:[],matchers:opts.matchers};

	if (text) {
		for ( var i in opts.matchers ) {
			// match may sometimes have to be an object to pass in more complex settings
			// in which case add a check for it being an object and if so handle those complexities
			// should we get +- 100 chars context?
			var match = opts.matchers[i];
			var mopts = 'g';
			if (opts.lowercase) mopts += 'i';
			if ( match.indexOf('/') === 0 ) {
				var lastslash = match.lastIndexOf('/');
				if (lastslash+1 !== match.length) {
					mopts = match.substring(lastslash+1);
					match = match.substring(1,lastslash);
				}
			} else {
				match = match.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
			}
			var m;
			var mr = new RegExp(match,mopts);
			while ( m = mr.exec(text) ) {
				res.matched += 1;
				res.matches.push({matched:match,result:m});
			}
		}
	}
	return res;

}
