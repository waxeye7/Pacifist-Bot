module.exports = function (grunt) {

    grunt.registerTask('default', 'Log some stuff.', function() {
        grunt.log.write('Logging some stuff...').ok();
      });
    let config = require('./.screeps.json');


    let branch = grunt.option('branch') || config.branch;
    let email = grunt.option('email') || config.email;
    let password = grunt.option('password') || config.password;
    let ptr = grunt.option('ptr') ? true : config.ptr

    grunt.loadNpmTasks('grunt-screeps');
    grunt.initConfig({
        
        screeps: {
            options: {
                email: email,
                password: password,
                branch: branch,
                ptr: ptr
            },
            dist: {
                src: ['src/*.js']
            }
        },

    uglify: {
        files: { 
            src: 'js/*.js',  // source files mask
            dest: 'jsm/',    // destination folder
            expand: true,    // allow dynamic building
            flatten: true,   // remove all unnecessary nesting
            ext: '.min.js'   // replace .js to .min.js
        }
    },
    watch: {
        js:  { files: 'js/*.js', tasks: [ 'uglify' ] },
    },




});

// load plugins
grunt.loadNpmTasks('grunt-contrib-watch');
grunt.loadNpmTasks('grunt-contrib-uglify');

// register at least this one task
grunt.registerTask('default', [ 'uglify' ]);
};