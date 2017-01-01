$(function() {
    // session selection
    $('.navbar-nav').on('click', '.viewSession', function() {
        let session = $(this).data('session');

        // let live = $(this).hasClass('live');
        // clearInterval(window.live);
        // if (live) {
        //     console.log('live');
        //     window.live = setInterval(() => viewSession(session), 1000);
        // }

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

    // view a session
    function viewSession(id) {
        console.log(id);
        $('#requests tr.item').empty();
        $('#requests').data('session', id);
        $.getJSON('/api/session/' + id, function(data) {
            if (data.length) {
                let first = data[0];
                let previous = data[0];
                $('.info-session').text('Session started at ' + moment(first.when).format('llll'));
                data.forEach(d => {
                    let item = $('#request-template').clone().show().addClass('item').attr('id', d.id);
                    item.find('.id').data('id', d.id).text(d.id);
                    let fromStart = moment.duration(d.when - first.when).asSeconds().toFixed(1);
                    item.find('.when').text('+' + fromStart + 's');
                    let fromPrev = moment.duration(d.when - previous.when).asSeconds().toFixed(1);
                    item.find('.prev').text('+' + fromPrev + 's');
                    item.appendTo('#requests');
                    previous = d;
                });
            }
        });
    }

    function viewRequestDetail(which, session, request) {
        console.log('View request ' + request);
        $('#jsonViewer').html('<h3>loading...</h3>');
        $('#' + request).addClass('success');
        $.getJSON(`/api/${which}/${session}/${request}`, function(data) {
            $('#jsonViewer').jsonViewer(data.decoded, {collapsed: true});
            $('#jsonViewer a').first().click();
            window.scrollTo(0, 0);
        });
    }

    // display a specific request
    $('#requests').on('click', '.id', function() {
        let session = $('#requests').data('session');
        let request = $(this).data('id');
        $('#requests .success').removeClass('success');
        $('.viewRequestResponse .request').addClass('btn-primary');
        $('.viewRequestResponse .response').removeClass('btn-primary');
        viewRequestDetail('request', session, request);
        return false;
    });

    // attach handler for session selection
    $.getJSON('/api/sessions', function(data) {
        let last = data.pop();
        $('#last-session').data('session', last.id);
        data.reverse().forEach(d => {
            $('#session-dropdown').append(`
                <li><a href="#" class='viewSession' data-session='${d.id}'>${d.title}</a></li>
            `);
        });
        viewSession(last.id);
        // window.live = setInterval(() => viewSession(last.id), 1000);
    });
});
