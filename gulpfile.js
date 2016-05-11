// Copyright 2016 Google Inc.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//      http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var gulp = require("gulp");
var browserify = require('browserify');
var babelify = require('babelify');
var source = require('vinyl-source-stream');
var babel = require('gulp-babel');
var concat = require('gulp-concat');

gulp.task("compile_js_web", function () {

    var b = browserify({
        entries: "./src/app.js"
        , debug: true
        , transform: [ babelify ]
    });

    return b.bundle()
		.pipe(source("app.js"))
        .pipe(gulp.dest("dist/web"));
});

gulp.task("compile_js_node", function () {

	return gulp.src('./src/**/*.js')
		.pipe(babel({
			presets: ['es2015']
		}))
    .pipe(gulp.dest('dist'));

});

gulp.task("compile_js_nest", function () {

	return gulp.src('./nest/**/*.js')
		.pipe(babel({
			presets: ['es2015']
		}))
    .pipe(gulp.dest('dist/nest'));

});

gulp.task("copy_html", function () {

    return gulp.src('./src/**/*.html')
        .pipe(gulp.dest('dist/'));
})

gulp.task("web", ['compile_js_web']);
gulp.task("node", ['compile_js_node', 'compile_js_nest', 'copy_html']);

gulp.task('default', ["node"]);
