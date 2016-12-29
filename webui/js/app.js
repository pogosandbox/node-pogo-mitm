$(function(){
    // session selection
    $(".navbar-nav").on('click', '.viewSession', function() {
        let session = $(this).data("session");
        viewSession(session);
    });

    function viewSession(id) {
        console.log(id);
        $("#requests tr.item").empty();
        $.getJSON("/api/session/" + id, function(data) {
            console.log(data);
            let first = data[0];
            $(".info-session").text("Session started at " + moment(first.when).format("llll"));
            data.forEach(d => {
                let item = $("#request-template").clone().show().addClass("item");
                item.find(".id").text(d.id);
                let duration = moment.duration(d.when - first.when).asSeconds().toFixed(1);
                item.find(".when").text("+" + duration + "s");
                // item.find(".id").text(d.id);
                item.appendTo("#requests");
            });
        });
    }

    // attach handler for session selection
    $.getJSON("/api/sessions", function(data) {
        let first = data.shift();
        $("#last-session").data('session', first.id);
        data.forEach(d => {
            $("#session-dropdown").append(`
                <li><a href="#" class='viewSession' data-session='${d.id}'>${d.title}</a></li>
            `);
        });
        viewSession(first.id);
    });
});