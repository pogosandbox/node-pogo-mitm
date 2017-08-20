$(function () {
    window.global = {};
    
    window.onhashchange = function () {
        if (window.location.hash) {
            $('#panel-all-sessions').hide();
            $('#panel-sesion').show();
            
            $('#requests .table-success').removeClass('table-success');
            let session = $('#requests').data('session');
            let request = window.location.hash.match(/request=(\d+)/);
            let which = $('.request').hasClass('btn-primary') ? 'request' : 'response';
            let first = $("#requests .item").first().attr("id");
            if (first && request) {
                viewRequestDetail(which, session, request ? request[1] : first);
            } else {
                $('#view-session-info').show();
                $('#panel-sesion').show();
                $('#view-request').hide();        
            }
        } else {
            $('#panel-all-sessions').show();
            $('#panel-sesion').hide();
        }
    };

    $('.btn-all-sessions').click(function () {
        $('#panel-all-sessions').show();
        $('#panel-sesion').hide();
    });

    // session selection
    $('.navbar-nav, #all-sessions').on('click', '.viewSession', function () {
        let session = $(this).data('session');

        $('.navbar-nav .active').removeClass('active');
        $(this).parent('li').addClass('active');

        viewSession(session);
    });

    // view request or response
    $('.viewRequestResponse').click(function () {
        $(this).find('.request').toggleClass('btn-primary');
        $(this).find('.response').toggleClass('btn-primary');
        let session = $('#requests').data('session');
        let request = $('#requests .table-success').attr('id');
        let which = $(this).find('.request').hasClass('btn-primary') ? 'request' : 'response';
        if (session && request) viewRequestDetail(which, session, request);
    });

    $('#next-request').click(function () {
        prevNext(+1);
        return false;
    });

    $('#prev-request').click(function () {
        prevNext(-1);
        return false;
    });

    $('#filter').on('input', function () {
        let filter = $('#filter').val().toLowerCase();
        $('#requests .item').each(function () {
            let api = $(this).find('.title').text().toLowerCase();
            if (api.indexOf(filter) >= 0) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });

    function prevNext(next) {
        let session = $('#requests').data('session');
        let item = $('#requests .table-success');
        if (next > 0) {
            let match = item.nextAll('.item:visible');
            if (match.length > 0) item = match.first();
        } else {
            let match = item.prevAll('.item:visible');
            if (match.length > 0) item = match.first();
        }

        let request = item.attr('id');
        $('#requests .table-success').removeClass('table-success');
        let which = $('.request').hasClass('btn-primary') ? 'request' : 'response';
        window.location.hash = `#session=${session}&request=${request}`;
        viewRequestDetail(which, session, request);
    }

    // view a session
    function viewSession(id, req) {
        console.log('View session ' + id);
        $('#panel-all-sessions').hide();
        $('#view-session-info').show();
        $('#panel-sesion').show();
        $('#view-request').hide();
        $('#jsonViewer').html('');
        $('#requests tr.item').remove();
        $('#requests').data('session', id);
        $.getJSON('/api/session/' + id, function (data) {
            $('.info-session a').attr('href', '#session=' + id);
            $('.info-session .text').html(data.title);
            if (data.files.length) {
                window.global.requests = data.files.length;
                let first = data.files[0];
                let previous = data.files[0];
                $('.info-session .text').html(`
                    Session started at ${moment(first.when).format('llll')}</br>
                    ${data.title}
                `);
                data.files.forEach(d => {
                    let item = $('#request-template').clone().show().addClass('item').addClass(d.id).attr('id', d.id);

                    item.find('.id').data('id', d.id).text(d.id).attr('href', `#session=${id}&request=${d.id}`);

                    item.find('.title').text(d.title);

                    let fromStart = moment.duration(d.when - first.when).asSeconds().toFixed(1);
                    item.find('.when').text('+' + fromStart + 's');

                    let fromPrev = moment.duration(d.when - previous.when).asSeconds().toFixed(1);
                    item.find('.prev').text('+' + fromPrev + 's').attr('title', 'from start: ' + moment.duration(d.when - first.when).humanize())

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
            let path = L.polyline(pts, { color: 'red' }).addTo(map);
            let bounds = path.getBounds();
            map.fitBounds(bounds);
        }
    }

    function viewRequestDetail(which, session, request) {
        console.log('View request ' + request);
        $('#view-request').css('display', '');
        $('#view-session-info').hide();
        $('#jsonViewer').html('<h3>loading...</h3>');
        $('#' + request).addClass('table-success');
        $.getJSON(`/api/${which}/${session}/${request}`, function (data) {
            $('#jsonViewer').jsonViewer(data.decoded, { collapsed: true });
            displayNicely();
        });
    }

    function displayNicely() {
        $('#jsonViewer a').first().click();
        let res = $('#jsonViewer a:contains("requests")');
        res = res.filter(function () {
            return $(this).text() === 'requests';
        }).first();
        if (res.length == 1) {
            res.click();
            res.parent().find('ol').first().find('a').first().click();
        } else {
            res = $('#jsonViewer a:contains("responses")');
            res = res.filter(function () {
                return $(this).text() === 'responses';
            }).first();
            if (res.length == 1) {
                res.click();
                res.parent().find('ol').first().find('a').first().click();
            }
        }
    }

    // display a specific request
    $('#requests').on('click', '.id', function () {
        let session = $('#requests').data('session');
        let request = $(this).data('id');
        $('#requests .table-success').removeClass('table-success');
        $('.viewRequestResponse .request').addClass('btn-primary');
        $('.viewRequestResponse .response').removeClass('btn-primary');
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
                    <a href="#session=${d.id}" class="viewSession list-group-item list-group-item-action" data-session='${d.id}'>${d.title}</a>
                `);
            });

            // current session menu
            let last = data[data.length - 1];
            $('#last-session').data('session', last.id);

            // previous 15 sessions as dropdown
            data.slice(-15).forEach(d => {
                $('#session-dropdown').prepend(`
                    <a href="#session=${d.id}" class='viewSession dropdown-item' data-session='${d.id}'>${d.title}</a>
                `);
            });

            showSessionFromUrl();
        });
    }

    $('.doanalyse').click(function(event) {
        event.preventDefault();
        let session = $('#requests').data('session');
        console.log('Analyse ' + session);
        loading();
        $.post({ url: '/api/analyse/' + session, json: true })
        .done(data => {
            $('.loadingoverlay').remove();
            window.location = data.redirect;
        }).fail(err => {
            $('.loadingoverlay').remove();
            console.log(err);
        });
    })

    function getConfig() {
        return $.getJSON('/api/config').done(data => {
            if (data.ga) {
                try {
                    (function (i, s, o, g, r, a, m) {
                    i['GoogleAnalyticsObject'] = r; i[r] = i[r] || function () {
                        (i[r].q = i[r].q || []).push(arguments)
                    }, i[r].l = 1 * new Date(); a = s.createElement(o),
                        m = s.getElementsByTagName(o)[0]; a.async = 1; a.src = g; m.parentNode.insertBefore(a, m)
                    })(window, document, 'script', 'https://www.google-analytics.com/analytics.js', 'ga');

                    ga('create', data.ga, 'auto');
                    ga('send', 'pageview');
                } catch (e) { }
            }
        });
    }

    getConfig().done(() => initSessions());
});

function loading() {
    let overlay = $('<div>', {
        class: 'loadingoverlay',
        css: {
            'background-color'  : 'rgba(255, 255, 255, 0.8)',
            'position'          : 'fixed',
            'top'               : 0,
            'left'              : 0,
            'width'             : '100%',
            'height'            : '100%',
            'display'           : 'flex',
            'flex-direction'    : 'column',
            'align-items'       : 'center',
            'justify-content'   : 'center',
            'z-index'           : 500,
        },
    });
    $(`<div class="cssload-loading">
        <div class="cssload-loading-circle cssload-loading-row1 cssload-loading-col3"></div>
        <div class="cssload-loading-circle cssload-loading-row2 cssload-loading-col2"></div>
        <div class="cssload-loading-circle cssload-loading-row2 cssload-loading-col3"></div>
        <div class="cssload-loading-circle cssload-loading-row2 cssload-loading-col4"></div>
        <div class="cssload-loading-circle cssload-loading-row3 cssload-loading-col1"></div>
        <div class="cssload-loading-circle cssload-loading-row3 cssload-loading-col2"></div>
        <div class="cssload-loading-circle cssload-loading-row3 cssload-loading-col3"></div>
        <div class="cssload-loading-circle cssload-loading-row3 cssload-loading-col4"></div>
        <div class="cssload-loading-circle cssload-loading-row3 cssload-loading-col5"></div>
        <div class="cssload-loading-circle cssload-loading-row4 cssload-loading-col2"></div>
        <div class="cssload-loading-circle cssload-loading-row4 cssload-loading-col3"></div>
        <div class="cssload-loading-circle cssload-loading-row4 cssload-loading-col4"></div>
        <div class="cssload-loading-circle cssload-loading-row5 cssload-loading-col3"></div>
    </div>`).appendTo(overlay);
    overlay.hide().appendTo('body').fadeIn();
}
