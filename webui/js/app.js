$(function() {
    window.global = {};

    $('.btn-all-sessions').click(function() {
        $('#panel-all-sessions').show();
        $('#panel-sesion').hide();       
    });

    // session selection
    $('.navbar-nav, #all-sessions').on('click', '.viewSession', function() {
        let session = $(this).data('session');

        $('.navbar-nav .active').removeClass('active');
        $(this).parent('li').addClass('active');

        viewSession(session);
    });

    // view request or response
    $('.viewRequestResponse').click(function() {
        $(this).find('.request').toggleClass('btn-primary');
        $(this).find('.response').toggleClass('btn-primary');
        let session = $('#requests').data('session');
        let request = $('#requests .success').attr('id');
        let which = $(this).find('.request').hasClass('btn-primary') ? 'request' : 'response';
        if (session && request) viewRequestDetail(which, session, request);
    });

    $('#next-request').click(function() {
        prevNext(+1);
        return false;
    });

    $('#prev-request').click(function() {
        prevNext(-1);
        return false;
    });

    function prevNext(next) {
        let session = $('#requests').data('session');
        let request = $('#requests .success').attr('id');
        let pad = '0000000000'.substring(0, request.length);
        request = +request + next + '';
        request = pad.substring(request.length) + request;
        if (request <= window.global.requests && $('.' + request).length > 0) {
            $('#requests .success').removeClass('success');
            let which = $('.request').hasClass('btn-primary') ? 'request' : 'response';
            window.location.hash = `#session=${session}&request=${request}`;
            viewRequestDetail(which, session, request);
        }
    }

    // view a session
    function viewSession(id, req) {
        $('#panel-all-sessions').hide();
        $('#panel-sesion').show();
        $('#view-request').hide();
        $('#view-session-info').show();
        $('#jsonViewer').html('');
        $('#requests tr.item').empty();
        $('#requests').data('session', id);
        $.getJSON('/api/session/' + id, function(data) {
            $('.info-session').html(`
                <div>${data.title}</div>
            `);
            if (data.files.length) {
                window.global.requests = data.files.length;
                let first = data.files[0];
                let previous = data.files[0];
                $('.info-session').html(`
                    <div>Session started at ${moment(first.when).format('llll')}</div>
                    <div>${data.title}</div>
                `);
                data.files.forEach(d => {
                    let item = $('#request-template').clone().show().addClass('item').addClass(d.id).attr('id', d.id);

                    item.find('.id').data('id', d.id).text(d.id).attr('href', `#session=${id}&request=${d.id}`);

                    item.find('.title').text(d.title);

                    let fromStart = moment.duration(d.when - first.when).asSeconds().toFixed(1);
                    item.find('.when').text('+' + fromStart + 's');

                    let fromPrev = moment.duration(d.when - previous.when).asSeconds().toFixed(1);
                    item.find('.prev').text('+' + fromPrev + 's');

                    item.appendTo('#requests');
                    previous = d;
                });
            }
            if (req) {
                viewRequestDetail('request', id, req);
            } else {
                viewSessionInfo(data);
            }
        });
    }

    function viewSessionInfo(data) {
        if (window.mapobj) {
            window.mapobj.remove();
            window.mapobj = null;
        }
        if (data.files.length > 0 && data.steps.length > 0) {
            console.log('Display map.');
            let map = window.mapobj = L.map('map').setView([51.505, -0.09], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            let pts = Array.from(data.steps, pt => L.latLng(pt.lat, pt.lng));
            let path = L.polyline(pts, {color: 'red'}).addTo(map);
            let bounds = path.getBounds();
            map.fitBounds(bounds);
        }
    }

    function viewRequestDetail(which, session, request) {
        console.log('View request ' + request);
        $('#view-request').show();
        $('#view-session-info').hide();
        $('#jsonViewer').html('<h3>loading...</h3>');
        $('.' + request).addClass('success');
        $.getJSON(`/api/${which}/${session}/${request}`, function(data) {
            $('#jsonViewer').jsonViewer(data.decoded, {collapsed: true});
            displayNicely();
            window.scrollTo(0, 0);
        });
    }

    function displayNicely() {
        $('#jsonViewer a').first().click();
        let res = $('#jsonViewer a:contains("requests")');
        res = res.filter(function() {
            return $(this).text() === 'requests';
        }).first();
        if (res.length == 1) {
            res.click();
            res.parent().find('ol').first().find('a').first().click();
        } else {
            res = $('#jsonViewer a:contains("responses")');
            res = res.filter(function() {
                return $(this).text() === 'responses';
            }).first();
            if (res.length == 1) {
                res.click();
                res.parent().find('ol').first().find('a').first().click();
            }
        }
    }

    // display a specific request
    $('#requests').on('click', '.id', function() {
        let session = $('#requests').data('session');
        let request = $(this).data('id');
        $('#requests .success').removeClass('success');
        $('.viewRequestResponse .request').addClass('btn-primary');
        $('.viewRequestResponse .response').removeClass('btn-primary');
        viewRequestDetail('request', session, request);
    });

    function showSessionFromUrl() {
        let session = undefined;
        let request = undefined;
        if (window.location.hash.length > 0 && window.location.hash[0] == '#') {
            let params = window.location.hash.substring(1).split('&');
            params.forEach(p => {
                if (p.startsWith('session=')) {
                    session = p.substring('session='.length);
                } else if (p.startsWith('request=')) {
                    request = p.substring('request='.length);
                }
            });
        }
        if (session) {
            viewSession(session, request);
        }
    }

    function initSessions() {
        // attach handler for session selection
        return $.getJSON('/api/sessions').done(data => {
            // all sessions modal
            data.forEach(d => {
                $('#all-sessions').prepend(`
                    <a href="#session=${d.id}" class="viewSession list-group-item" data-session='${d.id}'>${d.title}</a>
                `);
            });

            // current session menu
            let last = data[data.length - 1];
            $('#last-session').data('session', last.id);

            // previous sessions drop down
            data.slice(-15).forEach(d => {
                $('#session-dropdown').prepend(`
                    <li><a href="#session=${d.id}" class='viewSession' data-session='${d.id}'>${d.title}</a></li>
                `);
            });

            showSessionFromUrl();
        });
    }

    // window.onhashchange = function() {
    //     console.log('onhashchange');
    //     showSessionFromUrl();
    // }

    function getConfig() {
        return $.getJSON('/api/config').done(data => {
            if(data.ga) {
                try {
                    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
                    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
                    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
                    })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

                    ga('create', data.ga, 'auto');
                    ga('send', 'pageview');
                } catch(e) {}
            }
        });
    }

    getConfig().done(() => initSessions());
});
