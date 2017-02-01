$(function() {
    // session selection
    $('.navbar-nav, .bs-allsessions-modal-lg').on('click', '.viewSession', function() {
        $('.bs-allsessions-modal-lg').modal('hide');

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
        if ($('.' + request).length > 0) {
            $('#requests .success').removeClass('success');
            let which = $('.request').hasClass('btn-primary') ? 'request' : 'response';
            window.location.hash = `#session=${session}&request=${request}`;
            viewRequestDetail(which, session, request);
        }
    }

    // view a session
    function viewSession(id, req) {
        console.log(id);
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
                let first = data.files[0];
                let previous = data.files[0];
                $('.info-session').html(`
                    <div>Session started at ${moment(first.when).format('llll')}</div>
                    <div>${data.title}</div>
                `);
                data.files.forEach(d => {
                    let item = $('#request-template').clone().show().addClass('item').addClass(d.id).attr('id', d.id);
                    item.find('.id').data('id', d.id).text(d.id).attr('href', `#session=${id}&request=${d.id}`);
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

    // attach handler for session selection
    $.getJSON('/api/sessions', function(data) {
        // all sessions modal
        data.forEach(d => {
            $('#all-sessions').prepend(`
                <li><a href="#session=${d.id}" class='viewSession' data-session='${d.id}'>${d.title}</a></li>
            `);
        });

        // current session menu
        let last = data.pop();
        $('#last-session').data('session', last.id);

        // previous sessions drop down
        data.slice(-15).forEach(d => {
            $('#session-dropdown').prepend(`
                <li><a href="#session=${d.id}" class='viewSession' data-session='${d.id}'>${d.title}</a></li>
            `);
        });

        let session = last.id;
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
            console.log(params);
        }
        viewSession(session, request);
    });
});
