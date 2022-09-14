module.exports = function (grunt) {
    grunt.initConfig({
        
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

    // mkdir: {
    //     options: {
    //         create: ['tmp', 'src/roles/']
    //     },
    //   },
});

// load plugins
grunt.loadNpmTasks('grunt-contrib-watch');
grunt.loadNpmTasks('grunt-contrib-uglify');

// register at least this one task
grunt.registerTask('default', [ 'uglify' ]);

grunt.loadNpmTasks('grunt-mkdir');
};