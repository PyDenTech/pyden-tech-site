(function ($) {
    "use strict";

    // Spinner
    var spinner = function () {
        setTimeout(function () {
            if ($('#spinner').length > 0) {
                $('#spinner').removeClass('show');
            }
        }, 1);
    };
    spinner(0);


    // Initiate the wowjs
    new WOW().init();

    // Sticky Navbar
    $(window).scroll(function () {
        if ($(this).scrollTop() > 45) {
            $('.navbar').addClass('sticky-top shadow-sm');
        } else {
            $('.navbar').removeClass('sticky-top shadow-sm');
        }
    });


    // Hero Header carousel
    $(".header-carousel").owlCarousel({
        animateOut: 'fadeOut',
        items: 1,
        margin: 0,
        stagePadding: 0,
        autoplay: true,
        smartSpeed: 500,
        dots: true,
        loop: true,
        nav: true,
        navText: [
            '<i class="bi bi-arrow-right"></i>',
            '<i class="bi bi-arrow-left"></i>'
        ],
    });


    // attractions carousel
    $(".blog-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1500,
        center: false,
        dots: false,
        loop: true,
        margin: 25,
        nav: true,
        navText: [
            '<i class="fa fa-angle-left"></i>',
            '<i class="fa fa-angle-right"></i>'
        ],
        responsiveClass: true,
        responsive: {
            0: {
                items: 1
            },
            576: {
                items: 1
            },
            768: {
                items: 2
            },
            992: {
                items: 2
            },
            1200: {
                items: 3
            }
        }
    });


    // testimonial carousel
    $(".testimonial-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1500,
        center: false,
        dots: true,
        loop: true,
        margin: 25,
        nav: true,
        navText: [
            '<i class="fa fa-angle-left"></i>',
            '<i class="fa fa-angle-right"></i>'
        ],
        responsiveClass: true,
        responsive: {
            0: {
                items: 1
            },
            576: {
                items: 1
            },
            768: {
                items: 2
            },
            992: {
                items: 2
            },
            1200: {
                items: 3
            }
        }
    });


    // Facts counter
    $('[data-toggle="counter-up"]').counterUp({
        delay: 5,
        time: 2000
    });


    // Back to top button
    $(window).scroll(function () {
        if ($(this).scrollTop() > 300) {
            $('.back-to-top').fadeIn('slow');
        } else {
            $('.back-to-top').fadeOut('slow');
        }
    });
    $('.back-to-top').click(function () {
        $('html, body').animate({ scrollTop: 0 }, 1500, 'easeInOutExpo');
        return false;
    });


})(jQuery);

$(document).ready(function () {
    // Atualiza a classe "active" com base na rolagem
    $(window).on('scroll', function () {
        var scrollDistance = $(window).scrollTop();

        // Define os grupos de seções a serem consideradas
        var sections = [
            { id: 'services', elements: ['#services', '.feature', '.offer-section'] },
            { id: 'about', elements: ['#about'] },
            { id: 'blog', elements: ['#blog'] }
        ];

        // Itera sobre os grupos de seções para verificar se estão visíveis
        sections.forEach(function (section) {
            var isVisible = section.elements.some(function (selector) {
                var element = $(selector);
                if (element.length) {
                    var sectionTop = element.offset().top - 100; // Offset para ajuste
                    var sectionBottom = sectionTop + element.outerHeight();
                    return scrollDistance >= sectionTop && scrollDistance < sectionBottom;
                }
                return false;
            });

            // Atualiza a classe "active" se a seção estiver visível
            if (isVisible) {
                $('.navbar-nav .nav-link').removeClass('active');
                $('.navbar-nav .nav-link[href="#' + section.id + '"]').addClass('active');
            }
        });
    });

    // Atualiza a classe "active" ao clicar no link
    $('.navbar-nav .nav-link').on('click', function () {
        $('.navbar-nav .nav-link').removeClass('active');
        $(this).addClass('active');
    });
});
